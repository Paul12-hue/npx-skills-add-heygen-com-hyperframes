import Foundation
import XCTest
@testable import KaskadeCore

final class MatchTests: XCTestCase {
    func testUnknownArenaThrows() {
        XCTAssertThrowsError(try Match(config: MatchConfig(mode: .localDuel, arenaID: "nope"))) {
            XCTAssertEqual($0 as? MatchError, .unknownArena("nope"))
        }
    }

    func testUndoInLocalDuelTakesBackOneTurn() throws {
        var m = try Match(config: MatchConfig(mode: .localDuel, arenaID: "origin"))
        XCTAssertFalse(m.canUndo)
        try m.play(.drop(3))
        try m.play(.drop(4))
        try m.undo()
        XCTAssertEqual(m.history, [.drop(3)])
        XCTAssertEqual(m.state.toMove, .moon)
        XCTAssertEqual(m.undoCount, 1)
    }

    func testUndoRemovesAbilityTogetherWithFollowUp() throws {
        var m = try Match(config: MatchConfig(mode: .localDuel, arenaID: "expanse"))
        try m.play(.drop(3))
        try m.play(.anchor(3))   // moon starts with 2 energy here
        try m.play(.drop(2))
        try m.undo()
        XCTAssertEqual(m.history, [.drop(3)])
        XCTAssertEqual(m.state.energy(of: .moon), 2, "energy refunded by rewinding")
        XCTAssertFalse(m.state.awaitingFollowUpDrop)
    }

    func testUndoMidTurnRewindsToTurnStart() throws {
        var m = try Match(config: MatchConfig(mode: .localDuel, arenaID: "expanse"))
        try m.play(.drop(3))
        try m.play(.anchor(3))
        XCTAssertTrue(m.state.awaitingFollowUpDrop)
        try m.undo()
        XCTAssertEqual(m.history, [.drop(3)])
        XCTAssertFalse(m.state.awaitingFollowUpDrop)
    }

    func testUndoAgainstAIRemovesAIReply() throws {
        var m = try Match(config: MatchConfig(mode: .versusAI, arenaID: "origin", difficulty: .master, aiPlayer: .moon))
        try m.play(.drop(3))   // human
        XCTAssertTrue(m.isAITurn)
        try m.play(.drop(3))   // ai
        try m.play(.drop(2))   // human
        try m.play(.drop(4))   // ai
        try m.undo()
        XCTAssertEqual(m.history, [.drop(3), .drop(3)])
        XCTAssertEqual(m.state.toMove, .sun)
        XCTAssertFalse(m.isAITurn)
    }

    func testCannotUndoBeforeHumanMovedWhenAIStarts() throws {
        var m = try Match(config: MatchConfig(mode: .versusAI, arenaID: "origin", difficulty: .master, aiPlayer: .sun))
        try m.play(.drop(3))   // ai
        XCTAssertFalse(m.canUndo)
        XCTAssertThrowsError(try m.undo())
    }

    func testSnapshotRoundTripThroughJSON() throws {
        var m = try Match(config: MatchConfig(mode: .versusAI, arenaID: "expanse", difficulty: .strategist, aiPlayer: .moon))
        for move in [Move.drop(3), .anchor(2), .drop(2), .drop(1), .drop(1)] { try m.play(move) }
        try m.undo()
        let data = try JSONEncoder().encode(m.snapshot)
        let decoded = try JSONDecoder().decode(MatchSnapshot.self, from: data)
        let restored = try Match(snapshot: decoded)
        XCTAssertEqual(restored.state, m.state)
        XCTAssertEqual(restored.history, m.history)
        XCTAssertEqual(restored.undoCount, 1)
    }

    func testCorruptSnapshotIsRejected() throws {
        let bad = MatchSnapshot(config: MatchConfig(mode: .localDuel, arenaID: "classic"), moves: [.drop(0), .geyser(1)], undoCount: 0)
        XCTAssertThrowsError(try Match(snapshot: bad)) {
            guard case .invalidMove(index: 1, _, .abilitiesDisabled)? = $0 as? MatchError else {
                return XCTFail("unexpected \($0)")
            }
        }
        var wrongVersion = MatchSnapshot(config: MatchConfig(mode: .localDuel, arenaID: "classic"), moves: [], undoCount: 0)
        wrongVersion.version = 99
        XCTAssertThrowsError(try Match(snapshot: wrongVersion))
        let garbage = Data("{\"version\":1,\"moves\":[{\"kind\":\"teleport\",\"column\":1}]}".utf8)
        XCTAssertThrowsError(try JSONDecoder().decode(MatchSnapshot.self, from: garbage))
    }

    func testRestartResetsEverything() throws {
        var m = try Match(config: MatchConfig(mode: .training, arenaID: "origin"))
        try m.play(.drop(1))
        try m.undo()
        try m.play(.drop(2))
        m.restart()
        XCTAssertTrue(m.history.isEmpty)
        XCTAssertEqual(m.state, m.initialState)
        XCTAssertEqual(m.undoCount, 0)
    }

    func testPieceTrackerFollowsAllMoveKinds() throws {
        var m = try Match(config: MatchConfig(mode: .localDuel, arenaID: "monolith"))
        var tracker = PieceTracker(state: m.state)
        XCTAssertTrue(tracker.matches(m.state))
        let moves: [Move] = [.drop(3), .drop(2), .drop(2), .drop(2), .drop(0), .geyser(3), .drop(6), .drop(6), .drop(6)]
        for move in moves {
            let player = m.state.toMove
            try m.play(move)
            tracker.apply(move, by: player)
            XCTAssertTrue(tracker.matches(m.state), "after \(move)")
        }
        let lifted = tracker.columns[3]
        XCTAssertEqual(lifted.first?.owner, .moon, "geyser stone at the bottom")
        // Replaying the history reproduces identical piece IDs.
        let replayed = PieceTracker(initial: m.initialState, history: m.history)
        XCTAssertEqual(replayed, tracker)
    }

    func testPieceTrackerRiftRemovesTopPiece() throws {
        var s = position([".......", ".......", ".......", ".......", "...M...", "...S..."], toMove: .sun, sun: 3)
        var tracker = PieceTracker(state: s)
        let topID = tracker.columns[3].last!.id
        tracker.apply(.rift(3), by: .sun)
        try s.play(.rift(3))
        XCTAssertTrue(tracker.matches(s))
        XCTAssertFalse(tracker.columns[3].contains { $0.id == topID })
    }

    func testMatchStatistics() throws {
        var m = try Match(config: MatchConfig(mode: .localDuel, arenaID: "expanse"))
        // Sun claims crystal (1,1) after moon lands on (1,0).
        for move in [Move.drop(3), .drop(1), .drop(1), .anchor(0), .drop(0)] { try m.play(move) }
        XCTAssertEqual(m.crystalsClaimed(by: .sun), 1)
        XCTAssertEqual(m.abilityUses(for: .moon), [.anchor: 1])
        XCTAssertEqual(m.turnCount(for: .moon), 2)
        XCTAssertEqual(m.turnCount(for: .sun), 2)
    }
}
