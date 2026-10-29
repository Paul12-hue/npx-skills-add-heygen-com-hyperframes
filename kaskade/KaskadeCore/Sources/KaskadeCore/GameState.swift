/// Errors raised when an illegal move is attempted. The state is never modified in that case.
public enum RuleViolation: Error, Equatable, Sendable {
    case gameOver
    case columnOutOfRange
    case columnFull
    case columnEmpty
    case abilitiesDisabled
    case notEnoughEnergy(needed: Int, available: Int)
    case followUpDropRequired
    case boardTooFullForAnchor
}

/// What a move did, so the UI can animate and sound it.
public struct MoveEffects: Equatable, Sendable {
    public var move: Move
    public var player: Player
    /// Cell where a stone was placed (drop, anchor, or the bottom cell for a geyser).
    public var placedCell: Cell?
    /// Cell whose stone was removed by a rift.
    public var removedCell: Cell?
    /// Crystals consumed by this move and who gained energy from them (nil = destroyed by a neutral stone).
    public var crystalsClaimed: [(cell: Cell, by: Player?)]
    public var energySpent: Int
    public var outcome: Outcome

    public static func == (lhs: MoveEffects, rhs: MoveEffects) -> Bool {
        lhs.move == rhs.move && lhs.player == rhs.player && lhs.placedCell == rhs.placedCell
            && lhs.removedCell == rhs.removedCell && lhs.energySpent == rhs.energySpent
            && lhs.outcome == rhs.outcome
            && lhs.crystalsClaimed.map(\.cell) == rhs.crystalsClaimed.map(\.cell)
            && lhs.crystalsClaimed.map(\.by) == rhs.crystalsClaimed.map(\.by)
    }
}

/// Complete, self-contained rules state. A value type of fixed size without heap storage,
/// so the AI can copy it cheaply.
public struct GameState: Hashable, Sendable {
    public let geometry: Geometry
    public let abilitiesEnabled: Bool
    public let maxEnergy: Int

    public private(set) var sun: UInt64 = 0
    public private(set) var moon: UInt64 = 0
    public private(set) var neutral: UInt64 = 0
    /// Crystals that have not been claimed yet.
    public private(set) var crystals: UInt64 = 0
    public private(set) var energySun: Int
    public private(set) var energyMoon: Int
    public private(set) var toMove: Player = .sun
    /// True after an anchor or rift: the same player must now drop a normal stone.
    public private(set) var awaitingFollowUpDrop = false
    public private(set) var outcome: Outcome = .ongoing
    /// Number of actions played so far (an anchor + drop counts as two).
    public private(set) var actionCount = 0

    public init(arena: Arena) {
        precondition(arena.validate(), "invalid arena \(arena.id)")
        geometry = arena.geometry
        abilitiesEnabled = arena.abilitiesEnabled
        maxEnergy = arena.maxEnergy
        energySun = arena.abilitiesEnabled ? arena.startEnergySun : 0
        energyMoon = arena.abilitiesEnabled ? arena.startEnergyMoon : 0
        for o in arena.obstacles { neutral |= geometry.bit(o) }
        if arena.abilitiesEnabled {
            for c in arena.crystals { crystals |= geometry.bit(c) }
        }
    }

    /// Builds an arbitrary (gravity-consistent) position, used by puzzles and tests.
    public init(geometry: Geometry, sun: UInt64, moon: UInt64, neutral: UInt64, crystals: UInt64,
                energySun: Int, energyMoon: Int, toMove: Player, abilitiesEnabled: Bool = true,
                maxEnergy: Int = 3) {
        self.geometry = geometry
        self.abilitiesEnabled = abilitiesEnabled
        self.maxEnergy = maxEnergy
        self.sun = sun & geometry.boardMask
        self.moon = moon & geometry.boardMask
        self.neutral = neutral & geometry.boardMask
        self.crystals = crystals & geometry.boardMask & ~(sun | moon | neutral)
        self.energySun = min(max(energySun, 0), maxEnergy)
        self.energyMoon = min(max(energyMoon, 0), maxEnergy)
        self.toMove = toMove
        self.outcome = Self.evaluateOutcome(geometry: geometry, sun: self.sun, moon: self.moon, mover: toMove.opponent)
        if outcome == .ongoing && !hasAnyLegalMove { outcome = .draw }
    }

    // MARK: Queries

    public var occupied: UInt64 { sun | moon | neutral }

    public func stones(of player: Player) -> UInt64 { player == .sun ? sun : moon }

    public func energy(of player: Player) -> Int { player == .sun ? energySun : energyMoon }

    @inline(__always)
    public func height(of column: Int) -> Int {
        Int(((occupied >> UInt64(column * geometry.stride)) & geometry.columnMask).nonzeroBitCount)
    }

    public func owner(at cell: Cell) -> StoneOwner? {
        let b = geometry.bit(cell)
        if sun & b != 0 { return .sun }
        if moon & b != 0 { return .moon }
        if neutral & b != 0 { return .neutral }
        return nil
    }

    public func hasCrystal(at cell: Cell) -> Bool { crystals & geometry.bit(cell) != 0 }

    public var emptyCellCount: Int { geometry.cellCount - occupied.nonzeroBitCount }

    public func isColumnFull(_ column: Int) -> Bool { height(of: column) >= geometry.rows }

    /// Cells of the winning line(s), empty while the game is running.
    public var winningCells: [Cell] {
        guard case let .win(p) = outcome else { return [] }
        return geometry.cells(in: geometry.lineCells(stones(of: p)))
    }

    // MARK: Legality

    public func check(_ move: Move) -> RuleViolation? {
        guard outcome == .ongoing else { return .gameOver }
        guard move.column >= 0 && move.column < geometry.columns else { return .columnOutOfRange }
        if awaitingFollowUpDrop && move.kind != .drop { return .followUpDropRequired }
        if let ability = move.ability {
            guard abilitiesEnabled else { return .abilitiesDisabled }
            let available = energy(of: toMove)
            if available < ability.cost { return .notEnoughEnergy(needed: ability.cost, available: available) }
        }
        let h = height(of: move.column)
        switch move.kind {
        case .drop, .geyser:
            if h >= geometry.rows { return .columnFull }
        case .anchor:
            if h >= geometry.rows { return .columnFull }
            if emptyCellCount < 2 { return .boardTooFullForAnchor }
        case .rift:
            if h == 0 { return .columnEmpty }
        }
        return nil
    }

    public func isLegal(_ move: Move) -> Bool { check(move) == nil }

    public var legalMoves: [Move] {
        guard outcome == .ongoing else { return [] }
        var moves: [Move] = []
        moves.reserveCapacity(geometry.columns * 4)
        let cols = 0..<geometry.columns
        for c in cols where height(of: c) < geometry.rows { moves.append(.drop(c)) }
        if awaitingFollowUpDrop || !abilitiesEnabled { return moves }
        let e = energy(of: toMove)
        if e >= Ability.geyser.cost {
            for c in cols where height(of: c) < geometry.rows { moves.append(.geyser(c)) }
        }
        if e >= Ability.anchor.cost && emptyCellCount >= 2 {
            for c in cols where height(of: c) < geometry.rows { moves.append(.anchor(c)) }
        }
        if e >= Ability.rift.cost {
            for c in cols where height(of: c) > 0 { moves.append(.rift(c)) }
        }
        return moves
    }

    var hasAnyLegalMove: Bool {
        if occupied & geometry.boardMask != geometry.boardMask { return true }
        // Board full: only a rift can continue the game.
        return !awaitingFollowUpDrop && abilitiesEnabled && energy(of: toMove) >= Ability.rift.cost
    }

    // MARK: Playing

    /// Plays a move after validating it. Throws without changing the state if the move is illegal.
    @discardableResult
    public mutating func play(_ move: Move) throws -> MoveEffects {
        if let violation = check(move) { throw violation }
        return apply(move)
    }

    /// Plays a move known to be legal (used by the AI). Validated in debug builds.
    @discardableResult
    public mutating func apply(_ move: Move) -> MoveEffects {
        assert(check(move) == nil, "illegal move \(move)")
        let mover = toMove
        let g = geometry
        let c = move.column
        let h = height(of: c)
        var effects = MoveEffects(move: move, player: mover, placedCell: nil, removedCell: nil,
                                  crystalsClaimed: [], energySpent: move.ability?.cost ?? 0, outcome: .ongoing)
        if let ability = move.ability { addEnergy(-ability.cost, to: mover) }

        switch move.kind {
        case .drop:
            let b = g.bit(c, h)
            if mover == .sun { sun |= b } else { moon |= b }
            effects.placedCell = Cell(c, h)
            claimCrystal(at: Cell(c, h), effects: &effects)
        case .anchor:
            let b = g.bit(c, h)
            neutral |= b
            effects.placedCell = Cell(c, h)
            claimCrystal(at: Cell(c, h), effects: &effects)
        case .geyser:
            let cm = g.maskOfColumn(c)
            sun = (sun & ~cm) | ((sun & cm) << 1)
            moon = (moon & ~cm) | ((moon & cm) << 1)
            neutral = (neutral & ~cm) | ((neutral & cm) << 1)
            let bottom = g.bit(c, 0)
            if mover == .sun { sun |= bottom } else { moon |= bottom }
            effects.placedCell = Cell(c, 0)
            // Only the new top cell becomes newly occupied.
            claimCrystal(at: Cell(c, h), effects: &effects)
        case .rift:
            let b = ~g.bit(c, h - 1)
            sun &= b
            moon &= b
            neutral &= b
            effects.removedCell = Cell(c, h - 1)
        }

        actionCount += 1
        awaitingFollowUpDrop = move.ability?.grantsFollowUpDrop ?? false
        outcome = Self.evaluateOutcome(geometry: g, sun: sun, moon: moon, mover: mover)
        if outcome == .ongoing {
            if !awaitingFollowUpDrop { toMove = mover.opponent }
            if !hasAnyLegalMove { outcome = .draw }
        }
        effects.outcome = outcome
        return effects
    }

    /// The mover wins if they own a line (even if the opponent does too); otherwise an opponent line wins for them.
    static func evaluateOutcome(geometry g: Geometry, sun: UInt64, moon: UInt64, mover: Player) -> Outcome {
        let moverMask = mover == .sun ? sun : moon
        let otherMask = mover == .sun ? moon : sun
        if g.hasFour(moverMask) { return .win(mover) }
        if g.hasFour(otherMask) { return .win(mover.opponent) }
        return .ongoing
    }

    private mutating func claimCrystal(at cell: Cell, effects: inout MoveEffects) {
        let b = geometry.bit(cell)
        guard crystals & b != 0 else { return }
        crystals &= ~b
        let claimant: Player? = sun & b != 0 ? .sun : (moon & b != 0 ? .moon : nil)
        if let p = claimant { addEnergy(1, to: p) }
        effects.crystalsClaimed.append((cell, claimant))
    }

    private mutating func addEnergy(_ delta: Int, to player: Player) {
        if player == .sun {
            energySun = min(max(energySun + delta, 0), maxEnergy)
        } else {
            energyMoon = min(max(energyMoon + delta, 0), maxEnergy)
        }
    }
}
