import XCTest
@testable import KaskadeCore

final class TutorialTests: XCTestCase {
    func testEveryScriptedTurnIsLegalAndAccepted() throws {
        for step in Tutorial.steps {
            let start = step.makeState()
            XCTAssertEqual(start.outcome, .ongoing, "step \(step.id)")
            let turns = step.allowedTurns.isEmpty ? [[Move.drop(0)]] : step.allowedTurns
            for turn in turns {
                var s = start
                var partial: [Move] = []
                for move in turn {
                    XCTAssertTrue(step.accepts(move, after: partial), "step \(step.id) \(move)")
                    XCTAssertTrue(step.highlightedColumns(after: partial).contains(move.column) || step.allowedTurns.isEmpty)
                    try s.play(move)
                    partial.append(move)
                }
                XCTAssertTrue(step.completes(partial), "step \(step.id)")
                if s.outcome == .ongoing {
                    XCTAssertEqual(s.toMove, .moon)
                    for reply in step.reply { try s.play(reply) }
                }
            }
        }
    }

    func testWinningStepsActuallyWin() throws {
        for id in [2, 5, 6, 7] {
            let step = Tutorial.steps.first { $0.id == id }!
            var s = step.makeState()
            for m in step.allowedTurns[0] { try s.play(m) }
            XCTAssertEqual(s.outcome, .win(.sun), "step \(id)")
        }
    }

    func testCrystalStepGrantsEnergy() throws {
        let step = Tutorial.steps.first { $0.id == 4 }!
        var s = step.makeState()
        try s.play(.drop(2))
        XCTAssertEqual(s.energy(of: .sun), 2)
    }

    func testWrongMovesAreRejected() {
        let step = Tutorial.steps.first { $0.id == 5 }!
        XCTAssertFalse(step.accepts(.drop(4), after: []))
        XCTAssertFalse(step.accepts(.anchor(2), after: []))
        XCTAssertFalse(step.accepts(.drop(0), after: [.anchor(4)]))
        XCTAssertEqual(step.highlightedColumns(after: []), [0, 4])
        XCTAssertEqual(step.highlightedColumns(after: [.anchor(4)]), [4])
    }
}
