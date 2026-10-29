import XCTest
@testable import KaskadeCore

/// Random playouts across all arenas, checking invariants after every action.
final class FuzzTests: XCTestCase {
    func testRandomGamesKeepInvariants() {
        var rng = SeededRandom(seed: 2024)
        var finished = 0
        for game in 0..<1500 {
            let arena = Arena.catalog[game % Arena.catalog.count]
            var s = GameState(arena: arena)
            var tracker = PieceTracker(state: s)
            var steps = 0
            while s.outcome == .ongoing {
                let moves = s.legalMoves
                XCTAssertFalse(moves.isEmpty, "running game without moves")
                for m in moves { XCTAssertNil(s.check(m)) }
                let m = moves.randomElement(using: &rng)!
                let player = s.toMove
                s.apply(m)
                tracker.apply(m, by: player)
                checkInvariants(s)
                XCTAssertTrue(tracker.matches(s))
                steps += 1
                XCTAssertLessThan(steps, 400, "game must terminate")
                if steps >= 400 { break }
            }
            if s.outcome.isOver { finished += 1 }
        }
        XCTAssertEqual(finished, 1500)
    }

    private func checkInvariants(_ s: GameState, file: StaticString = #filePath, line: UInt = #line) {
        let g = s.geometry
        XCTAssertEqual(s.sun & s.moon, 0, file: file, line: line)
        XCTAssertEqual(s.sun & s.neutral, 0, file: file, line: line)
        XCTAssertEqual(s.moon & s.neutral, 0, file: file, line: line)
        XCTAssertEqual(s.occupied & ~g.boardMask, 0, "stone outside board", file: file, line: line)
        XCTAssertEqual(s.crystals & s.occupied, 0, "crystal under a stone", file: file, line: line)
        XCTAssertTrue((0...s.maxEnergy).contains(s.energy(of: .sun)), file: file, line: line)
        XCTAssertTrue((0...s.maxEnergy).contains(s.energy(of: .moon)), file: file, line: line)
        for c in 0..<g.columns {
            let col = (s.occupied >> UInt64(c * g.stride)) & g.columnMask
            // Gravity: occupied bits of a column are contiguous from the bottom.
            XCTAssertEqual(col & (col + 1), 0, "floating stone in column \(c)", file: file, line: line)
        }
        if case .ongoing = s.outcome {
            XCTAssertFalse(g.hasFour(s.sun), file: file, line: line)
            XCTAssertFalse(g.hasFour(s.moon), file: file, line: line)
        }
    }
}
