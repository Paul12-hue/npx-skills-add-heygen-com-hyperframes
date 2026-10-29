import XCTest
@testable import KaskadeCore

final class AbilityTests: XCTestCase {
    // MARK: Energy and availability

    func testAbilitiesRequireEnergy() {
        var s = GameState(arena: .origin)
        XCTAssertThrowsError(try s.play(.anchor(3))) {
            XCTAssertEqual($0 as? RuleViolation, .notEnoughEnergy(needed: 2, available: 0))
        }
        XCTAssertThrowsError(try s.play(.geyser(3)))
        XCTAssertThrowsError(try s.play(.rift(3)))
    }

    func testAbilitiesDisabledInClassic() {
        var s = position([".......", ".......", ".......", ".......", ".......", "...S..."], toMove: .moon, moon: 3, abilities: false)
        XCTAssertThrowsError(try s.play(.anchor(0))) { XCTAssertEqual($0 as? RuleViolation, .abilitiesDisabled) }
        XCTAssertTrue(s.legalMoves.allSatisfy { $0.kind == .drop })
    }

    func testLegalMoveListMatchesEnergy() {
        let s = position([".......", ".......", ".......", ".......", ".......", "...S..."], toMove: .moon, moon: 2)
        let kinds = Set(s.legalMoves.map(\.kind))
        let poor = position([".......", ".......", ".......", ".......", ".......", "...S..."], toMove: .moon, moon: 1)
        XCTAssertEqual(Set(poor.legalMoves.map(\.kind)), [.drop])
        XCTAssertEqual(kinds, [.drop, .anchor, .geyser])
        let rich = position([".......", ".......", ".......", ".......", ".......", "...S..."], toMove: .moon, moon: 3)
        XCTAssertEqual(rich.legalMoves.filter { $0.kind == .rift }, [.rift(3)], "only non-empty columns can be rifted")
    }

    // MARK: Anchor

    func testAnchorPlacesNeutralStoneAndRequiresFollowUpDrop() throws {
        var s = position([".......", ".......", ".......", ".......", ".......", "...S..."], toMove: .moon, moon: 2)
        try s.play(.anchor(3))
        XCTAssertEqual(s.owner(at: Cell(3, 1)), .neutral)
        XCTAssertEqual(s.energy(of: .moon), 0)
        XCTAssertEqual(s.toMove, .moon, "same player continues")
        XCTAssertTrue(s.awaitingFollowUpDrop)
        XCTAssertTrue(s.legalMoves.allSatisfy { $0.kind == .drop })
        XCTAssertThrowsError(try s.play(.geyser(0))) { XCTAssertEqual($0 as? RuleViolation, .followUpDropRequired) }
        try s.play(.drop(3))
        XCTAssertEqual(s.owner(at: Cell(3, 2)), .moon)
        XCTAssertEqual(s.toMove, .sun)
        XCTAssertFalse(s.awaitingFollowUpDrop)
    }

    func testNeutralStonesBreakLines() {
        let s = position([".......", ".......", ".......", ".......", ".......", "SSNS..."], toMove: .moon)
        XCTAssertEqual(s.outcome, .ongoing)
    }

    func testAnchorDestroysCrystalWithoutEnergy() throws {
        var s = position([".......", ".......", ".......", ".......", "...*...", "...S..."], toMove: .moon, moon: 2)
        let effects = try s.play(.anchor(3))
        XCTAssertEqual(effects.crystalsClaimed.count, 1)
        XCTAssertNil(effects.crystalsClaimed[0].by)
        XCTAssertEqual(s.energy(of: .moon), 0)
        XCTAssertEqual(s.crystals, 0)
    }

    func testAnchorNeedsRoomForFollowUp() {
        // Only one empty cell left: an anchor would leave no space for the follow-up drop.
        let s = position(["SMSMSM.", "MSMSMSM", "MSMSMSM", "SMSMSMS", "SMSMSMS", "MSMSMSM"], toMove: .moon, moon: 3)
        XCTAssertEqual(s.emptyCellCount, 1)
        XCTAssertEqual(s.check(.anchor(6)), .boardTooFullForAnchor)
    }

    // MARK: Geyser

    func testGeyserLiftsColumnAndInsertsAtBottom() throws {
        var s = position([".......", ".......", ".......", "...N...", "...M...", "...S..."], toMove: .moon, moon: 2)
        let effects = try s.play(.geyser(3))
        XCTAssertEqual(effects.placedCell, Cell(3, 0))
        XCTAssertEqual(s.owner(at: Cell(3, 0)), .moon)
        XCTAssertEqual(s.owner(at: Cell(3, 1)), .sun)
        XCTAssertEqual(s.owner(at: Cell(3, 2)), .moon)
        XCTAssertEqual(s.owner(at: Cell(3, 3)), .neutral)
        XCTAssertEqual(s.height(of: 3), 4)
        XCTAssertEqual(s.energy(of: .moon), 0)
        XCTAssertEqual(s.toMove, .sun, "geyser is the whole turn")
    }

    func testGeyserOnEmptyColumnActsLikeDrop() throws {
        var s = position([".......", ".......", ".......", ".......", ".......", "...S..."], toMove: .moon, moon: 2)
        try s.play(.geyser(0))
        XCTAssertEqual(s.owner(at: Cell(0, 0)), .moon)
        XCTAssertEqual(s.height(of: 0), 1)
    }

    func testGeyserIllegalOnFullColumn() {
        let s = position(["...S...", "...M...", "...S...", "...M...", "...S...", "...M..."], toMove: .moon, moon: 2)
        XCTAssertEqual(s.check(.geyser(3)), .columnFull)
    }

    func testGeyserCompletesOwnLine() throws {
        var s = Puzzle.named("p04")!.makeState()
        XCTAssertEqual(s.outcome, .ongoing)
        let effects = try s.play(.geyser(2))
        XCTAssertEqual(effects.outcome, .win(.sun))
    }

    func testGeyserThatOnlyCompletesOpponentLineLoses() throws {
        // Moon owns (0..2, 1); column 3 is [M, S]. Sun's geyser lifts the moon stone into (3, 1).
        var s = position([".......", ".......", ".......", ".......", "MMMS...", "SSMM..."], toMove: .sun, sun: 2)
        XCTAssertEqual(s.outcome, .ongoing)
        let effects = try s.play(.geyser(3))
        XCTAssertFalse(s.geometry.hasFour(s.stones(of: .sun)))
        XCTAssertEqual(effects.outcome, .win(.moon))
    }

    func testGeyserCreatingBothLinesWinsForMover() throws {
        // Lifting column 3 completes sun's bottom row and moon's second row at the same time.
        var s = position([".......", ".......", ".......", ".......", "MMMS...", "SSSM..."], toMove: .sun, sun: 2)
        XCTAssertEqual(s.outcome, .ongoing)
        let effects = try s.play(.geyser(3))
        XCTAssertTrue(s.geometry.hasFour(s.stones(of: .sun)))
        XCTAssertTrue(s.geometry.hasFour(s.stones(of: .moon)))
        XCTAssertEqual(effects.outcome, .win(.sun))
    }

    func testGeyserClaimsCrystalForStonePushedOntoIt() throws {
        var s = position([".......", ".......", ".......", "...*...", "...S...", "...M..."], toMove: .moon, moon: 2)
        let effects = try s.play(.geyser(3))
        // The sun stone from row 1 rises onto the crystal at row 2.
        XCTAssertEqual(effects.crystalsClaimed.first?.cell, Cell(3, 2))
        XCTAssertEqual(effects.crystalsClaimed.first?.by, .sun)
        XCTAssertEqual(s.energy(of: .sun), 1)
        XCTAssertEqual(s.energy(of: .moon), 0)
    }

    // MARK: Rift

    func testRiftRemovesTopStoneThenRequiresDrop() throws {
        var s = position([".......", ".......", ".......", ".......", "...M...", "...S..."], toMove: .sun, sun: 3)
        let effects = try s.play(.rift(3))
        XCTAssertEqual(effects.removedCell, Cell(3, 1))
        XCTAssertNil(s.owner(at: Cell(3, 1)))
        XCTAssertEqual(s.owner(at: Cell(3, 0)), .sun)
        XCTAssertEqual(s.energy(of: .sun), 0)
        XCTAssertTrue(s.awaitingFollowUpDrop)
        XCTAssertEqual(s.toMove, .sun)
        XCTAssertThrowsError(try s.play(.rift(3)))
        try s.play(.drop(3))
        XCTAssertEqual(s.owner(at: Cell(3, 1)), .sun)
        XCTAssertEqual(s.toMove, .moon)
    }

    func testRiftIllegalOnEmptyColumn() {
        let s = position([".......", ".......", ".......", ".......", ".......", "...S..."], toMove: .moon, moon: 3)
        XCTAssertEqual(s.check(.rift(0)), .columnEmpty)
    }

    func testRiftDoesNotRestoreCrystal() throws {
        var s = position([".......", ".......", ".......", ".......", "...*...", "...S..."], toMove: .moon, moon: 0)
        try s.play(.drop(3))
        XCTAssertEqual(s.energy(of: .moon), 1)
        var rich = GameState(geometry: s.geometry, sun: s.sun, moon: s.moon, neutral: 0, crystals: 0,
                             energySun: 3, energyMoon: 1, toMove: .sun)
        try rich.play(.rift(3))
        XCTAssertEqual(rich.crystals, 0)
    }

    func testRiftKeepsGameAliveOnFullBoard() throws {
        let full = position(["SMSMSMS", "MSMSMSM", "MSMSMSM", "SMSMSMS", "SMSMSMS", "MSMSMSM"], toMove: .sun, sun: 3)
        XCTAssertEqual(full.emptyCellCount, 0)
        XCTAssertEqual(full.outcome, .ongoing, "sun can still rift")
        XCTAssertTrue(full.legalMoves.allSatisfy { $0.kind == .rift })
        let stuck = position(["SMSMSMS", "MSMSMSM", "MSMSMSM", "SMSMSMS", "SMSMSMS", "MSMSMSM"], toMove: .sun, sun: 2)
        XCTAssertEqual(stuck.outcome, .draw)
    }
}
