/// How a match is played.
public enum GameMode: String, Codable, Sendable, CaseIterable {
    case versusAI, localDuel, training, puzzle, tutorial

    public var displayName: String {
        switch self {
        case .versusAI: return "Solo gegen KI"
        case .localDuel: return "Duell"
        case .training: return "Training"
        case .puzzle: return "Rätsel"
        case .tutorial: return "Tutorial"
        }
    }

    /// Whether results count for statistics and XP.
    public var isRated: Bool { self == .versusAI || self == .localDuel }
}

public struct MatchConfig: Codable, Hashable, Sendable {
    public var mode: GameMode
    public var arenaID: String
    /// AI strength for `.versusAI` (and the optional opponent in training).
    public var difficulty: Difficulty?
    /// Side controlled by the AI, if any.
    public var aiPlayer: Player?
    public var puzzleID: String?

    public init(mode: GameMode, arenaID: String, difficulty: Difficulty? = nil, aiPlayer: Player? = nil, puzzleID: String? = nil) {
        self.mode = mode
        self.arenaID = arenaID
        self.difficulty = difficulty
        self.aiPlayer = aiPlayer
        self.puzzleID = puzzleID
    }

    public var arena: Arena? { Arena.named(arenaID) }
}

/// Persistable form of a running match. Restoring replays and re-validates every move,
/// so a corrupted or tampered save can never produce an invalid board.
public struct MatchSnapshot: Codable, Hashable, Sendable {
    public static let currentVersion = 1
    public var version: Int
    public var config: MatchConfig
    public var moves: [Move]
    public var undoCount: Int

    public init(config: MatchConfig, moves: [Move], undoCount: Int) {
        self.version = Self.currentVersion
        self.config = config
        self.moves = moves
        self.undoCount = undoCount
    }
}

public enum MatchError: Error, Equatable, Sendable {
    case unknownArena(String)
    case unknownPuzzle(String)
    case unsupportedVersion(Int)
    case invalidMove(index: Int, Move, RuleViolation)
    case nothingToUndo
    case notYourTurn
}

/// A match: configuration, starting position, move history and the derived current state.
public struct Match: Sendable {
    public let config: MatchConfig
    public let initialState: GameState
    public private(set) var state: GameState
    public private(set) var history: [Move] = []
    /// Moves taken back so far (assisted games earn less XP and no achievements).
    public private(set) var undoCount = 0

    public init(config: MatchConfig) throws {
        if config.mode == .puzzle {
            guard let id = config.puzzleID, let puzzle = Puzzle.named(id) else {
                throw MatchError.unknownPuzzle(config.puzzleID ?? "")
            }
            initialState = puzzle.makeState()
        } else {
            guard let arena = config.arena else { throw MatchError.unknownArena(config.arenaID) }
            initialState = GameState(arena: arena)
        }
        self.config = config
        state = initialState
    }

    /// A match that starts from a prepared position (tutorial steps).
    public init(config: MatchConfig, initialState: GameState) {
        self.config = config
        self.initialState = initialState
        state = initialState
    }

    public init(snapshot: MatchSnapshot) throws {
        guard snapshot.version == MatchSnapshot.currentVersion else {
            throw MatchError.unsupportedVersion(snapshot.version)
        }
        try self.init(config: snapshot.config)
        for (i, move) in snapshot.moves.enumerated() {
            do {
                try state.play(move)
            } catch let violation as RuleViolation {
                throw MatchError.invalidMove(index: i, move, violation)
            }
            history.append(move)
        }
        undoCount = max(0, snapshot.undoCount)
    }

    public var snapshot: MatchSnapshot { MatchSnapshot(config: config, moves: history, undoCount: undoCount) }

    public var isOver: Bool { state.outcome.isOver }

    /// True when the AI side has to act (including its follow-up drop).
    public var isAITurn: Bool { !isOver && config.aiPlayer == state.toMove }

    /// Plays a validated move and records it.
    @discardableResult
    public mutating func play(_ move: Move) throws -> MoveEffects {
        let effects = try state.play(move)
        history.append(move)
        return effects
    }

    public var canUndo: Bool {
        guard config.mode != .tutorial, !history.isEmpty else { return false }
        if config.aiPlayer != nil {
            // Need at least one human action to take back.
            return humanActionIndices.last != nil
        }
        return true
    }

    private var humanActionIndices: [Int] {
        guard let ai = config.aiPlayer else { return Array(history.indices) }
        var replay = initialState
        var indices: [Int] = []
        for (i, m) in history.enumerated() {
            if replay.toMove != ai { indices.append(i) }
            replay.apply(m)
        }
        return indices
    }

    /// Takes back the last turn. Against the AI this rewinds to the human's previous decision,
    /// also removing the AI's reply. An anchor/rift plus its follow-up drop is undone together.
    public mutating func undo() throws {
        guard canUndo else { throw MatchError.nothingToUndo }
        var target: Int
        if config.aiPlayer != nil {
            target = humanActionIndices.last!
        } else {
            target = history.count - 1
        }
        // Rewind to the start of that turn (the ability that preceded a follow-up drop).
        var states: [GameState] = [initialState]
        var replay = initialState
        for m in history {
            replay.apply(m)
            states.append(replay)
        }
        while target > 0 && states[target].awaitingFollowUpDrop { target -= 1 }
        history.removeSubrange(target...)
        state = states[target]
        undoCount += 1
    }

    /// Restarts the match from its initial position.
    public mutating func restart() {
        state = initialState
        history.removeAll()
        undoCount = 0
    }

    /// Abilities used per player so far.
    public func abilityUses(for player: Player) -> [Ability: Int] {
        var replay = initialState
        var counts: [Ability: Int] = [:]
        for m in history {
            if replay.toMove == player, let a = m.ability { counts[a, default: 0] += 1 }
            replay.apply(m)
        }
        return counts
    }

    /// Crystals claimed per player so far.
    public func crystalsClaimed(by player: Player) -> Int {
        var replay = initialState
        var count = 0
        for m in history {
            let effects = replay.apply(m)
            count += effects.crystalsClaimed.filter { $0.by == player }.count
        }
        return count
    }

    /// The move that ended the game, if any.
    public var decisiveMove: Move? { isOver ? history.last : nil }

    /// Number of full turns taken by `player`.
    public func turnCount(for player: Player) -> Int {
        var replay = initialState
        var count = 0
        for m in history {
            if replay.toMove == player && !replay.awaitingFollowUpDrop { count += 1 }
            replay.apply(m)
        }
        return count
    }
}
