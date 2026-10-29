import Foundation

/// AI strength levels. Each differs in search depth, time budget and deliberate imprecision.
public enum Difficulty: String, Codable, CaseIterable, Sendable, Identifiable {
    case apprentice, strategist, master, grandmaster

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .apprentice: return "Lehrling"
        case .strategist: return "Stratege"
        case .master: return "Meister"
        case .grandmaster: return "Großmeister"
        }
    }

    public var summary: String {
        switch self {
        case .apprentice: return "Spielt locker und übersieht manches. Ideal zum Einstieg."
        case .strategist: return "Denkt einige Züge voraus und nutzt Fähigkeiten gezielt."
        case .master: return "Rechnet tief, verteidigt sauber und bestraft Fehler."
        case .grandmaster: return "Volle Rechenkraft. Nur mit echtem Plan zu schlagen."
        }
    }

    public var config: AIConfig {
        switch self {
        case .apprentice:
            return AIConfig(maxDepth: 2, timeLimit: 0.4, noiseTolerance: 45, shortsightedChance: 0.3, abilityChance: 0.35)
        case .strategist:
            return AIConfig(maxDepth: 4, timeLimit: 0.8, noiseTolerance: 10, shortsightedChance: 0.0, abilityChance: 0.85)
        case .master:
            return AIConfig(maxDepth: 7, timeLimit: 0.9, noiseTolerance: 0, shortsightedChance: 0, abilityChance: 1)
        case .grandmaster:
            return AIConfig(maxDepth: 24, timeLimit: 2.0, noiseTolerance: 0, shortsightedChance: 0, abilityChance: 1)
        }
    }
}

public struct AIConfig: Sendable, Equatable {
    /// Maximum search depth in turns.
    public var maxDepth: Int
    /// Wall-clock budget in seconds. Iterative deepening keeps the best completed iteration.
    public var timeLimit: Double
    /// Root moves scoring within this margin of the best are picked at random (0 = always best).
    public var noiseTolerance: Int
    /// Chance to search only one turn deep (misses opponent threats like a beginner).
    public var shortsightedChance: Double
    /// Chance per turn that abilities are considered at all.
    public var abilityChance: Double

    public init(maxDepth: Int, timeLimit: Double, noiseTolerance: Int, shortsightedChance: Double, abilityChance: Double) {
        self.maxDepth = maxDepth
        self.timeLimit = timeLimit
        self.noiseTolerance = noiseTolerance
        self.shortsightedChance = shortsightedChance
        self.abilityChance = abilityChance
    }
}

/// Deterministic, seedable random generator (SplitMix64) so AI games are reproducible in tests.
public struct SeededRandom: RandomNumberGenerator, Sendable {
    private var state: UInt64
    public init(seed: UInt64) { state = seed &+ 0x9E37_79B9_7F4A_7C15 }
    public mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

/// Static position evaluation from one player's perspective.
public struct Evaluator: Sendable {
    public let geometry: Geometry
    private let windows: [UInt64]
    private let centerMask: UInt64

    public static let energyValue = 7
    public static let riftReadyBonus = 8

    public init(geometry: Geometry) {
        self.geometry = geometry
        windows = geometry.allWindows()
        var center: UInt64 = 0
        let mid = geometry.columns / 2
        let centerColumns = geometry.columns % 2 == 1 ? [mid] : [mid - 1, mid]
        for c in centerColumns { center |= geometry.maskOfColumn(c) }
        centerMask = center
    }

    public func score(_ s: GameState, for player: Player) -> Int {
        let mine = s.stones(of: player)
        let theirs = s.stones(of: player.opponent)
        let neutral = s.neutral
        let occupied = s.occupied
        // Parity: the opening player profits from threats on odd rows (row index 0, 2, 4…), the other on even rows.
        let sunRows = oddRowMask
        let goodForMe = player == .sun ? sunRows : ~sunRows
        var total = 0
        for w in windows where w & neutral == 0 {
            let m = (mine & w).nonzeroBitCount
            let t = (theirs & w).nonzeroBitCount
            if m > 0 && t > 0 { continue }
            if m > 0 {
                total += Self.windowWeight[m]
                if m == 3 && (w & ~occupied & goodForMe) != 0 { total += 12 }
            } else if t > 0 {
                total -= Self.windowWeight[t]
                if t == 3 && (w & ~occupied & ~goodForMe) != 0 { total -= 12 }
            }
        }
        total += 3 * ((mine & centerMask).nonzeroBitCount - (theirs & centerMask).nonzeroBitCount)
        if s.abilitiesEnabled {
            let myEnergy = s.energy(of: player)
            let theirEnergy = s.energy(of: player.opponent)
            total += Self.energyValue * (myEnergy - theirEnergy)
            if myEnergy >= Ability.rift.cost { total += Self.riftReadyBonus }
            if theirEnergy >= Ability.rift.cost { total -= Self.riftReadyBonus }
        }
        return total
    }

    private static let windowWeight = [0, 1, 5, 22, 0]

    private var oddRowMask: UInt64 {
        var mask: UInt64 = 0
        for c in 0..<geometry.columns {
            for r in stride(from: 0, to: geometry.rows, by: 2) { mask |= geometry.bit(c, r) }
        }
        return mask
    }
}

public struct SearchResult: Sendable {
    public var move: Move
    public var score: Int
    public var depthReached: Int
    public var nodes: Int
}

/// Negamax with alpha-beta pruning, iterative deepening, a transposition table and a time limit.
/// One engine instance is not thread-safe; create one per background task.
public final class SearchEngine {
    public static let winScore = 1_000_000

    private struct Entry {
        var key: UInt64 = 0
        var score: Int32 = 0
        var depth: Int8 = -1
        var flag: UInt8 = 0  // 0 exact, 1 lower bound, 2 upper bound
        var move: UInt16 = .max
    }

    private var table: [Entry]
    private let tableMask: Int
    private var evaluator: Evaluator?
    private var nodes = 0
    private var deadline: ContinuousClock.Instant = .now
    private var aborted = false
    private var considerAbilities = true
    private let clock = ContinuousClock()

    public init(tableBits: Int = 18) {
        table = Array(repeating: Entry(), count: 1 << tableBits)
        tableMask = (1 << tableBits) - 1
    }

    /// Picks a move for `state.toMove` using the given strength. Always returns a legal move for a running game.
    public func chooseMove<R: RandomNumberGenerator>(for state: GameState, difficulty: Difficulty, rng: inout R) -> Move? {
        chooseMove(for: state, config: difficulty.config, rng: &rng)
    }

    public func chooseMove<R: RandomNumberGenerator>(for state: GameState, config: AIConfig, rng: inout R) -> Move? {
        let legal = state.legalMoves
        guard !legal.isEmpty else { return nil }
        if legal.count == 1 { return legal[0] }
        considerAbilities = Double.random(in: 0..<1, using: &rng) < config.abilityChance
        let depth = Double.random(in: 0..<1, using: &rng) < config.shortsightedChance ? 1 : config.maxDepth

        if config.noiseTolerance > 0 {
            // Score every root move, then pick among the near-best ones.
            let scored = scoreRootMoves(state, depth: depth, timeLimit: config.timeLimit)
            guard let best = scored.map(\.score).max() else { return legal[0] }
            let candidates = scored.filter { $0.score >= best - config.noiseTolerance && $0.score > -Self.winScore / 2 || $0.score == best }
            return candidates.randomElement(using: &rng)?.move ?? scored[0].move
        }
        return search(state, maxDepth: depth, timeLimit: config.timeLimit)?.move
    }

    /// Iterative deepening search for the best move.
    public func search(_ state: GameState, maxDepth: Int, timeLimit: Double) -> SearchResult? {
        guard let first = state.legalMoves.first else { return nil }
        prepare(for: state, timeLimit: timeLimit)
        var result = SearchResult(move: first, score: 0, depthReached: 0, nodes: 0)
        for depth in 1...max(1, maxDepth) {
            var bestMove = first
            var bestScore = Int.min
            var alpha = -Self.winScore - 1
            let beta = Self.winScore + 1
            for move in ordered(state.legalMoves, state: state, ttMove: depth > 1 ? result.move : nil) {
                let score = childScore(state, move: move, depth: depth, alpha: alpha, beta: beta, ply: 0)
                if aborted { break }
                if score > bestScore {
                    bestScore = score
                    bestMove = move
                }
                alpha = max(alpha, score)
            }
            if aborted && depth > 1 { break }
            result = SearchResult(move: bestMove, score: bestScore, depthReached: depth, nodes: nodes)
            if aborted || abs(bestScore) > Self.winScore / 2 { break }
        }
        result.nodes = nodes
        return result
    }

    /// Full-window scores for each root move at a fixed depth (used for imprecise difficulty levels).
    public func scoreRootMoves(_ state: GameState, depth: Int, timeLimit: Double) -> [(move: Move, score: Int)] {
        prepare(for: state, timeLimit: timeLimit)
        var results: [(Move, Int)] = []
        for move in ordered(state.legalMoves, state: state, ttMove: nil) {
            let score = childScore(state, move: move, depth: depth, alpha: -Self.winScore - 1, beta: Self.winScore + 1, ply: 0)
            results.append((move, score))
        }
        return results
    }

    private func prepare(for state: GameState, timeLimit: Double) {
        if evaluator?.geometry != state.geometry { evaluator = Evaluator(geometry: state.geometry) }
        nodes = 0
        aborted = false
        deadline = clock.now.advanced(by: .milliseconds(Int(timeLimit * 1000)))
    }

    /// Score of `move` from the perspective of the player making it.
    private func childScore(_ s: GameState, move: Move, depth: Int, alpha: Int, beta: Int, ply: Int) -> Int {
        var child = s
        child.apply(move)
        switch child.outcome {
        case .win(let p):
            return p == s.toMove ? Self.winScore - ply : -(Self.winScore - ply)
        case .draw:
            return 0
        case .ongoing:
            if child.toMove == s.toMove {
                // Follow-up drop after anchor/rift: same player, same depth.
                return negamax(child, depth: depth, alpha: alpha, beta: beta, ply: ply + 1)
            }
            return -negamax(child, depth: depth - 1, alpha: -beta, beta: -alpha, ply: ply + 1)
        }
    }

    private func negamax(_ s: GameState, depth: Int, alpha alphaIn: Int, beta betaIn: Int, ply: Int) -> Int {
        nodes += 1
        if nodes & 1023 == 0 && clock.now >= deadline { aborted = true }
        if aborted { return 0 }

        let me = s.toMove
        // Immediate win by a plain drop ends the search here.
        let own = s.stones(of: me)
        for c in 0..<s.geometry.columns {
            let h = s.height(of: c)
            if h < s.geometry.rows && s.geometry.hasFour(own | s.geometry.bit(c, h)) {
                return Self.winScore - ply - 1
            }
        }
        if depth <= 0 { return evaluator!.score(s, for: me) }

        var alpha = alphaIn
        var beta = betaIn
        let key = hash(s)
        let index = Int(truncatingIfNeeded: key) & tableMask
        var ttMove: Move?
        let entry = table[index]
        if entry.key == key && entry.depth >= 0 {
            ttMove = Self.unpack(entry.move)
            if Int(entry.depth) >= depth {
                let score = Self.fromTable(Int(entry.score), ply: ply)
                switch entry.flag {
                case 0: return score
                case 1: alpha = max(alpha, score)
                default: beta = min(beta, score)
                }
                if alpha >= beta { return score }
            }
        }

        var moves = s.legalMoves
        if !considerAbilities || ply > 6 { moves.removeAll { $0.kind != .drop } }
        if moves.isEmpty { moves = s.legalMoves }
        var best = Int.min
        var bestMove = moves[0]
        for move in ordered(moves, state: s, ttMove: ttMove) {
            let score = childScore(s, move: move, depth: depth, alpha: alpha, beta: beta, ply: ply)
            if aborted { return 0 }
            if score > best {
                best = score
                bestMove = move
            }
            if score > alpha { alpha = score }
            if alpha >= beta { break }
        }

        let flag: UInt8 = best <= alphaIn ? 2 : (best >= beta ? 1 : 0)
        table[index] = Entry(key: key, score: Int32(Self.toTable(best, ply: ply)), depth: Int8(clamping: depth),
                             flag: flag, move: Self.pack(bestMove))
        return best
    }

    /// Center-first drops, then geysers, anchors and rifts. The TT move always goes first.
    private func ordered(_ moves: [Move], state: GameState, ttMove: Move?) -> [Move] {
        let mid = Double(state.geometry.columns - 1) / 2
        func rank(_ m: Move) -> Double {
            if m == ttMove { return -100 }
            let kindRank: Double
            switch m.kind {
            case .drop: kindRank = 0
            case .geyser: kindRank = 10
            case .anchor: kindRank = 20
            case .rift: kindRank = 30
            }
            return kindRank + abs(Double(m.column) - mid)
        }
        return moves.sorted { rank($0) < rank($1) }
    }

    private func hash(_ s: GameState) -> UInt64 {
        let extra = UInt64(s.energySun) | UInt64(s.energyMoon) << 3 | UInt64(s.toMove.rawValue) << 6
            | (s.awaitingFollowUpDrop ? 1 << 7 : 0) | (considerAbilities ? 1 << 8 : 0)
        return Self.mix(s.sun ^ Self.mix(s.moon ^ Self.mix(s.neutral ^ Self.mix(s.crystals ^ Self.mix(extra)))))
    }

    private static func mix(_ x: UInt64) -> UInt64 {
        var z = x &+ 0x9E37_79B9_7F4A_7C15
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }

    private static func toTable(_ score: Int, ply: Int) -> Int {
        if score > winScore / 2 { return score + ply }
        if score < -winScore / 2 { return score - ply }
        return score
    }

    private static func fromTable(_ score: Int, ply: Int) -> Int {
        if score > winScore / 2 { return score - ply }
        if score < -winScore / 2 { return score + ply }
        return score
    }

    private static let kinds: [Move.Kind] = [.drop, .anchor, .geyser, .rift]

    private static func pack(_ m: Move) -> UInt16 {
        UInt16(kinds.firstIndex(of: m.kind)!) << 8 | UInt16(m.column)
    }

    private static func unpack(_ v: UInt16) -> Move? {
        guard v != .max else { return nil }
        return Move(kinds[Int(v >> 8)], Int(v & 0xFF))
    }
}
