import XCTest
@testable import KaskadeCore

/// Builds a position from a top-to-bottom layout (`.` empty, `*` crystal, `S`, `M`, `N`).
func position(_ layout: [String], toMove: Player = .sun, sun: Int = 0, moon: Int = 0, abilities: Bool = true) -> GameState {
    Puzzle(id: "test", title: "", goal: "", hint: "", layout: layout, toMove: toMove,
           energySun: sun, energyMoon: moon, abilitiesEnabled: abilities, turns: 1).makeState()
}

final class RulesTests: XCTestCase {
    func testAllArenasAreValid() {
        for arena in Arena.catalog {
            XCTAssertTrue(arena.validate(), arena.id)
            XCTAssertEqual(Set(Arena.catalog.map(\.id)).count, Arena.catalog.count)
        }
    }

    func testInvalidArenaIsRejected() {
        let floating = Arena(id: "x", name: "x", tagline: "", columns: 7, rows: 6, crystals: [], obstacles: [Cell(2, 3)])
        XCTAssertFalse(floating.validate())
        let tooBig = Arena(id: "y", name: "y", tagline: "", columns: 9, rows: 7, crystals: [])
        XCTAssertFalse(tooBig.validate())
        let crystalOnObstacle = Arena(id: "z", name: "z", tagline: "", columns: 7, rows: 6, crystals: [Cell(0, 0)], obstacles: [Cell(0, 0)])
        XCTAssertFalse(crystalOnObstacle.validate())
    }

    func testInitialStateOfOrigin() {
        let s = GameState(arena: .origin)
        XCTAssertEqual(s.toMove, .sun)
        XCTAssertEqual(s.energy(of: .sun), 0)
        XCTAssertEqual(s.energy(of: .moon), 1)
        XCTAssertEqual(s.crystals.nonzeroBitCount, 4)
        XCTAssertEqual(s.outcome, .ongoing)
        XCTAssertEqual(s.legalMoves.filter { $0.kind == .drop }.count, 7)
        XCTAssertTrue(s.legalMoves.allSatisfy { $0.kind == .drop }, "sun has no energy at start")
    }

    func testStonesFallToLowestFreeCell() throws {
        var s = GameState(arena: .classic)
        try s.play(.drop(3))
        try s.play(.drop(3))
        try s.play(.drop(3))
        XCTAssertEqual(s.owner(at: Cell(3, 0)), .sun)
        XCTAssertEqual(s.owner(at: Cell(3, 1)), .moon)
        XCTAssertEqual(s.owner(at: Cell(3, 2)), .sun)
        XCTAssertEqual(s.height(of: 3), 3)
        XCTAssertEqual(s.toMove, .moon)
    }

    func testFullColumnIsIllegalAndStateUnchanged() throws {
        var s = GameState(arena: .classic)
        for _ in 0..<6 { try s.play(.drop(0)) }
        let before = s
        XCTAssertThrowsError(try s.play(.drop(0))) { XCTAssertEqual($0 as? RuleViolation, .columnFull) }
        XCTAssertEqual(s, before)
        XCTAssertFalse(s.legalMoves.contains(.drop(0)))
    }

    func testColumnOutOfRange() {
        var s = GameState(arena: .classic)
        XCTAssertThrowsError(try s.play(.drop(7))) { XCTAssertEqual($0 as? RuleViolation, .columnOutOfRange) }
        XCTAssertThrowsError(try s.play(.drop(-1))) { XCTAssertEqual($0 as? RuleViolation, .columnOutOfRange) }
    }

    func testHorizontalWin() throws {
        var s = GameState(arena: .classic)
        for c in [0, 0, 1, 1, 2, 2] { try s.play(.drop(c)) }
        XCTAssertEqual(s.outcome, .ongoing)
        try s.play(.drop(3))
        XCTAssertEqual(s.outcome, .win(.sun))
        XCTAssertEqual(Set(s.winningCells), [Cell(0, 0), Cell(1, 0), Cell(2, 0), Cell(3, 0)])
        XCTAssertTrue(s.legalMoves.isEmpty)
        XCTAssertThrowsError(try s.play(.drop(5))) { XCTAssertEqual($0 as? RuleViolation, .gameOver) }
    }

    func testVerticalWinForMoon() throws {
        var s = GameState(arena: .classic)
        for c in [0, 6, 1, 6, 0, 6, 1] { try s.play(.drop(c)) }
        try s.play(.drop(6))
        XCTAssertEqual(s.outcome, .win(.moon))
    }

    func testDiagonalWins() {
        let rising = position([".......", ".......", "...S...", "..SM...", ".SMM...", "SMMS..."], toMove: .moon)
        XCTAssertEqual(rising.outcome, .win(.sun))
        let falling = position([".......", ".......", "M......", "SM.....", "SSM....", "SSSM..."], toMove: .sun)
        XCTAssertEqual(falling.outcome, .win(.moon))
    }

    func testNoWrapAroundBetweenColumns() {
        // Three on top of column 0 and one at the bottom of column 1 must not count as a line.
        let s = position(["S......", "S......", "S......", "M......", "M......", "MS....."], toMove: .moon)
        XCTAssertEqual(s.outcome, .ongoing)
        // Horizontal across the right edge into the next "row" must not count either.
        let edge = position([".......", ".......", ".......", ".......", ".......", "S...SSS"], toMove: .moon)
        XCTAssertEqual(edge.outcome, .ongoing)
    }

    func testDrawOnFullBoardWithoutAbilities() throws {
        // A known drawn fill order for 7x6 (column pattern that never makes four).
        var s = GameState(arena: .classic)
        let order = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0,
                     2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2,
                     4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4,
                     6, 6, 6, 6, 6, 6]
        for (i, c) in order.enumerated() {
            XCTAssertEqual(s.outcome, .ongoing, "move \(i)")
            try s.play(.drop(c))
        }
        XCTAssertEqual(s.outcome, .draw)
    }

    func testCrystalGivesEnergyAndIsConsumed() throws {
        var s = GameState(arena: .origin)
        // Crystal at (1,1): moon drops at (1,0), sun lands on (1,1).
        try s.play(.drop(3))
        try s.play(.drop(1))
        XCTAssertTrue(s.hasCrystal(at: Cell(1, 1)))
        let effects = try s.play(.drop(1))
        XCTAssertEqual(effects.crystalsClaimed.count, 1)
        XCTAssertEqual(effects.crystalsClaimed.first?.by, .sun)
        XCTAssertEqual(s.energy(of: .sun), 1)
        XCTAssertFalse(s.hasCrystal(at: Cell(1, 1)))
    }

    func testEnergyIsCapped() {
        var s = position([".......", ".......", ".......", ".......", "..*....", "..M...."], toMove: .sun, sun: 3)
        s.apply(.drop(2))
        XCTAssertEqual(s.energy(of: .sun), 3)
        XCTAssertEqual(s.crystals, 0)
    }

    func testObstaclesArePlacedAndCountForNobody() {
        let s = GameState(arena: .monolith)
        XCTAssertEqual(s.owner(at: Cell(3, 0)), .neutral)
        XCTAssertEqual(s.owner(at: Cell(0, 1)), .neutral)
        XCTAssertEqual(s.height(of: 0), 2)
        XCTAssertEqual(s.height(of: 1), 0)
    }

    func testLargeArenaGeometry() throws {
        var s = GameState(arena: .expanse)
        XCTAssertEqual(s.geometry.columns, 8)
        XCTAssertEqual(s.geometry.rows, 7)
        for _ in 0..<7 { try s.play(.drop(7)) }
        XCTAssertTrue(s.isColumnFull(7))
        for c in [0, 0, 1, 1, 2, 2] { try s.play(.drop(c)) }
        XCTAssertEqual(s.outcome, .ongoing)
    }
}
