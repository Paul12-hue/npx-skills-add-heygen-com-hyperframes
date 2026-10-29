/// A stone with a stable identity, so the UI can animate it between cells (geysers lift whole columns).
public struct Piece: Identifiable, Hashable, Sendable {
    public let id: Int
    public let owner: StoneOwner
}

/// Mirrors a `GameState` as columns of identified pieces. IDs are assigned deterministically,
/// so replaying a history (e.g. after undo) yields the same IDs for the same stones.
public struct PieceTracker: Hashable, Sendable {
    /// columns[c][r] is the piece at row r (bottom = 0).
    public private(set) var columns: [[Piece]]
    private var nextID: Int

    public init(state: GameState) {
        columns = Array(repeating: [], count: state.geometry.columns)
        nextID = 0
        for c in 0..<state.geometry.columns {
            for r in 0..<state.height(of: c) {
                if let owner = state.owner(at: Cell(c, r)) { append(owner, to: c) }
            }
        }
    }

    public init(initial: GameState, history: [Move]) {
        self.init(state: initial)
        var replay = initial
        for m in history {
            apply(m, by: replay.toMove)
            replay.apply(m)
        }
    }

    public mutating func apply(_ move: Move, by player: Player) {
        let c = move.column
        switch move.kind {
        case .drop: append(StoneOwner(player), to: c)
        case .anchor: append(.neutral, to: c)
        case .geyser:
            columns[c].insert(Piece(id: nextID, owner: StoneOwner(player)), at: 0)
            nextID += 1
        case .rift:
            if !columns[c].isEmpty { columns[c].removeLast() }
        }
    }

    /// Every piece with its cell, for rendering.
    public var placedPieces: [(piece: Piece, cell: Cell)] {
        var result: [(Piece, Cell)] = []
        for (c, column) in columns.enumerated() {
            for (r, piece) in column.enumerated() { result.append((piece, Cell(c, r))) }
        }
        return result
    }

    /// True if this tracker shows exactly the stones of `state`.
    public func matches(_ state: GameState) -> Bool {
        for c in 0..<state.geometry.columns {
            guard columns[c].count == state.height(of: c) else { return false }
            for (r, piece) in columns[c].enumerated() where state.owner(at: Cell(c, r)) != piece.owner {
                return false
            }
        }
        return true
    }

    private mutating func append(_ owner: StoneOwner, to column: Int) {
        columns[column].append(Piece(id: nextID, owner: owner))
        nextID += 1
    }
}
