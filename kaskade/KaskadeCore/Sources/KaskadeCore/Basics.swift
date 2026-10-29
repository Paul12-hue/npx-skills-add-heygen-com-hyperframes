/// The two factions. `sun` always opens the match.
public enum Player: Int, Codable, CaseIterable, Sendable {
    case sun = 0
    case moon = 1

    public var opponent: Player { self == .sun ? .moon : .sun }
}

/// Who a stone on the board belongs to. Neutral stones (anchors, arena monoliths) belong to nobody.
public enum StoneOwner: Int, Codable, Sendable, Hashable {
    case sun, moon, neutral

    public init(_ player: Player) { self = player == .sun ? .sun : .moon }

    public var player: Player? {
        switch self {
        case .sun: return .sun
        case .moon: return .moon
        case .neutral: return nil
        }
    }
}

/// Special abilities, paid for with energy gained from crystals.
public enum Ability: String, Codable, CaseIterable, Sendable {
    /// Drop a neutral stone, then make a normal drop.
    case anchor
    /// Push an own stone in from below; every stone in the column rises one row. This is the turn.
    case geyser
    /// Remove the top stone of a column, then make a normal drop.
    case rift

    public var cost: Int {
        switch self {
        case .anchor: return 2
        case .geyser: return 2
        case .rift: return 3
        }
    }

    /// Whether the same player must follow up with a normal drop.
    public var grantsFollowUpDrop: Bool { self != .geyser }
}

/// A single action on the board. A turn is one `drop`/`geyser`, or an `anchor`/`rift` followed by a `drop`.
public struct Move: Hashable, Codable, Sendable, CustomStringConvertible {
    public enum Kind: String, Codable, Sendable {
        case drop, anchor, geyser, rift
    }

    public var kind: Kind
    public var column: Int

    public init(_ kind: Kind, _ column: Int) {
        self.kind = kind
        self.column = column
    }

    public static func drop(_ column: Int) -> Move { Move(.drop, column) }
    public static func anchor(_ column: Int) -> Move { Move(.anchor, column) }
    public static func geyser(_ column: Int) -> Move { Move(.geyser, column) }
    public static func rift(_ column: Int) -> Move { Move(.rift, column) }

    public var ability: Ability? {
        switch kind {
        case .drop: return nil
        case .anchor: return .anchor
        case .geyser: return .geyser
        case .rift: return .rift
        }
    }

    public var description: String { "\(kind.rawValue)(\(column))" }
}

/// Board coordinate. Row 0 is the bottom row.
public struct Cell: Hashable, Codable, Sendable {
    public var column: Int
    public var row: Int

    public init(_ column: Int, _ row: Int) {
        self.column = column
        self.row = row
    }
}

public enum Outcome: Hashable, Codable, Sendable {
    case ongoing
    case win(Player)
    case draw

    public var isOver: Bool { self != .ongoing }
}

/// Precomputed bit layout for a board size. Bit index = column * stride + row, stride = rows + 1
/// (one empty sentinel bit on top of each column keeps line detection from wrapping).
public struct Geometry: Hashable, Codable, Sendable {
    public let columns: Int
    public let rows: Int
    public let stride: Int
    public let columnMask: UInt64
    public let boardMask: UInt64
    public let bottomMask: UInt64

    public static let maxBits = 64

    public init(columns: Int, rows: Int) {
        precondition(columns >= 4 && rows >= 4, "board must be at least 4x4")
        precondition(columns * (rows + 1) <= Geometry.maxBits, "board too large for 64-bit layout")
        self.columns = columns
        self.rows = rows
        self.stride = rows + 1
        self.columnMask = (UInt64(1) << UInt64(rows)) - 1
        var board: UInt64 = 0
        var bottom: UInt64 = 0
        for c in 0..<columns {
            board |= columnMask << UInt64(c * (rows + 1))
            bottom |= UInt64(1) << UInt64(c * (rows + 1))
        }
        self.boardMask = board
        self.bottomMask = bottom
    }

    public var cellCount: Int { columns * rows }

    @inline(__always)
    public func bit(_ column: Int, _ row: Int) -> UInt64 {
        UInt64(1) << UInt64(column * stride + row)
    }

    @inline(__always)
    public func bit(_ cell: Cell) -> UInt64 { bit(cell.column, cell.row) }

    @inline(__always)
    public func maskOfColumn(_ column: Int) -> UInt64 {
        columnMask << UInt64(column * stride)
    }

    public func contains(_ cell: Cell) -> Bool {
        cell.column >= 0 && cell.column < columns && cell.row >= 0 && cell.row < rows
    }

    public func cells(in mask: UInt64) -> [Cell] {
        var result: [Cell] = []
        for c in 0..<columns {
            for r in 0..<rows where mask & bit(c, r) != 0 {
                result.append(Cell(c, r))
            }
        }
        return result
    }

    /// True if `mask` contains four connected bits in any direction.
    @inline(__always)
    public func hasFour(_ mask: UInt64) -> Bool {
        for shift in [1, stride, stride - 1, stride + 1] {
            let s = UInt64(shift)
            let pairs = mask & (mask >> s)
            if pairs & (pairs >> (2 * s)) != 0 { return true }
        }
        return false
    }

    /// All cells that are part of some four-in-a-row inside `mask`.
    public func lineCells(_ mask: UInt64) -> UInt64 {
        var result: UInt64 = 0
        for shift in [1, stride, stride - 1, stride + 1] {
            let s = UInt64(shift)
            let pairs = mask & (mask >> s)
            let quads = pairs & (pairs >> (2 * s))
            // quads marks the lowest bit of each run; expand back to all four bits.
            result |= quads | (quads << s) | (quads << (2 * s)) | (quads << (3 * s))
        }
        return result & mask
    }

    /// Every 4-cell window on the board (used by the evaluator).
    public func allWindows() -> [UInt64] {
        var windows: [UInt64] = []
        let directions = [(1, 0), (0, 1), (1, 1), (1, -1)]
        for c in 0..<columns {
            for r in 0..<rows {
                for (dc, dr) in directions {
                    let endC = c + 3 * dc
                    let endR = r + 3 * dr
                    guard endC >= 0, endC < columns, endR >= 0, endR < rows else { continue }
                    var w: UInt64 = 0
                    for i in 0..<4 { w |= bit(c + i * dc, r + i * dr) }
                    windows.append(w)
                }
            }
        }
        return windows
    }
}

extension UInt64 {
    @inline(__always) var popCount: Int { nonzeroBitCount }
}
