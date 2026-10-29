/// A hand-built position: "win within N of your turns", the opponent defends perfectly.
/// Layout rows are written top to bottom: `.` empty, `*` crystal, `S` sun, `M` moon, `N` neutral.
public struct Puzzle: Identifiable, Hashable, Sendable {
    public let id: String
    public let title: String
    public let goal: String
    public let hint: String
    public let layout: [String]
    public let toMove: Player
    public let energySun: Int
    public let energyMoon: Int
    public let abilitiesEnabled: Bool
    /// Number of own turns allowed to force the win.
    public let turns: Int

    public var attacker: Player { toMove }

    public func makeState() -> GameState {
        let rows = layout.count
        let columns = layout.first?.count ?? 0
        let g = Geometry(columns: columns, rows: rows)
        var sun: UInt64 = 0, moon: UInt64 = 0, neutral: UInt64 = 0, crystals: UInt64 = 0
        for (i, line) in layout.enumerated() {
            let row = rows - 1 - i
            for (c, ch) in line.enumerated() {
                let b = g.bit(c, row)
                switch ch {
                case "S": sun |= b
                case "M": moon |= b
                case "N": neutral |= b
                case "*": crystals |= b
                default: break
                }
            }
        }
        return GameState(geometry: g, sun: sun, moon: moon, neutral: neutral, crystals: crystals,
                         energySun: energySun, energyMoon: energyMoon, toMove: toMove,
                         abilitiesEnabled: abilitiesEnabled)
    }

    /// True if every stone rests on the floor or on another stone.
    public var isGravityConsistent: Bool {
        let s = makeState()
        let g = s.geometry
        for c in 0..<g.columns {
            var seenEmpty = false
            for r in 0..<g.rows {
                let filled = s.occupied & g.bit(c, r) != 0
                if filled && seenEmpty { return false }
                if !filled { seenEmpty = true }
            }
        }
        return true
    }

    public static func named(_ id: String) -> Puzzle? { catalog.first { $0.id == id } }

    public static let catalog: [Puzzle] = [
        Puzzle(id: "p01", title: "Erster Funke", goal: "Gewinne in 1 Zug.",
               hint: "Diagonalen zählen auch.",
               layout: [".......",
                        ".......",
                        ".......",
                        "..SM...",
                        ".SMS...",
                        "SMSMM.."],
               toMove: .sun, energySun: 0, energyMoon: 0, abilitiesEnabled: false, turns: 1),
        Puzzle(id: "p02", title: "Zwickmühle", goal: "Gewinne in 2 Zügen.",
               hint: "Schaffe zwei Drohungen auf einmal.",
               layout: [".......",
                        ".......",
                        ".......",
                        ".......",
                        ".MM....",
                        ".SS...."],
               toMove: .sun, energySun: 0, energyMoon: 0, abilitiesEnabled: false, turns: 2),
        Puzzle(id: "p03", title: "Brückenschlag", goal: "Gewinne in 1 Zug.",
               hint: "Der Anker hebt deinen nächsten Stein eine Reihe höher.",
               layout: [".......",
                        ".......",
                        ".......",
                        ".......",
                        ".SSS...",
                        ".MMM..."],
               toMove: .sun, energySun: 2, energyMoon: 0, abilitiesEnabled: true, turns: 1),
        Puzzle(id: "p04", title: "Aufwind", goal: "Gewinne in 1 Zug.",
               hint: "Ein Geysir hebt eine ganze Spalte an.",
               layout: [".......",
                        ".......",
                        "...S...",
                        "..MM...",
                        ".SSM...",
                        "SMMS..."],
               toMove: .sun, energySun: 2, energyMoon: 0, abilitiesEnabled: true, turns: 1),
        Puzzle(id: "p05", title: "Bruchstelle", goal: "Gewinne in 1 Zug.",
               hint: "Der Spalt entfernt den obersten Stein, dann wirfst du.",
               layout: [".......",
                        ".......",
                        ".......",
                        ".......",
                        "MMM....",
                        "SSSMS.."],
               toMove: .sun, energySun: 3, energyMoon: 0, abilitiesEnabled: true, turns: 1),
    ]
}

/// Exact solver for short forced wins (used to verify puzzles and in the puzzle mode).
public enum Solver {
    /// Returns a first move that forces a win for `state.toMove` within `turns` own turns, if one exists.
    public static func winningMove(_ state: GameState, turns: Int) -> Move? {
        let attacker = state.toMove
        guard turns > 0, state.outcome == .ongoing else { return nil }
        for m in state.legalMoves where forces(after: m, from: state, attacker: attacker, turns: turns) {
            return m
        }
        return nil
    }

    public static func hasForcedWin(_ state: GameState, turns: Int) -> Bool {
        winningMove(state, turns: turns) != nil
    }

    private static func attackerWins(_ s: GameState, attacker: Player, turns: Int) -> Bool {
        for m in s.legalMoves where forces(after: m, from: s, attacker: attacker, turns: turns) { return true }
        return false
    }

    private static func forces(after m: Move, from s: GameState, attacker: Player, turns: Int) -> Bool {
        var child = s
        child.apply(m)
        switch child.outcome {
        case .win(let p): return p == attacker
        case .draw: return false
        case .ongoing:
            if child.toMove == attacker { return attackerWins(child, attacker: attacker, turns: turns) }
            return turns > 1 && defenderLoses(child, attacker: attacker, turns: turns - 1)
        }
    }

    /// True if every defence leads to an attacker win within `turns`.
    private static func defenderLoses(_ s: GameState, attacker: Player, turns: Int) -> Bool {
        for m in s.legalMoves {
            var child = s
            child.apply(m)
            switch child.outcome {
            case .win(let p): if p != attacker { return false }
            case .draw: return false
            case .ongoing:
                if child.toMove != attacker {
                    if !defenderLoses(child, attacker: attacker, turns: turns) { return false }
                } else if !attackerWins(child, attacker: attacker, turns: turns) {
                    return false
                }
            }
        }
        return true
    }
}
