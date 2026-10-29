import XCTest

/// End-to-end tests on the simulator: real taps on the board, full games, screenshots as attachments.
final class KaskadeUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .landscapeLeft
        app = XCUIApplication()
        app.launchArguments = ["-uiTesting"]
    }

    override func tearDown() {
        XCUIDevice.shared.orientation = .landscapeLeft
    }

    private func element(_ id: String) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }

    private func snapshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// Taps the centre of a board column, mirroring the app's BoardLayout math.
    private func tapColumn(_ column: Int, columns: Int = 7, rows: Int = 6) {
        let board = element("board")
        let f = board.frame
        let cell = min(f.width / (CGFloat(columns) + 0.6), f.height / (CGFloat(rows) + 1.6))
        let total = CGFloat(columns) * cell + 0.6 * cell
        let originX = (f.width - total) / 2
        let x = originX + 0.3 * cell + (CGFloat(column) + 0.5) * cell
        let totalHeight = CGFloat(rows) * cell + 0.6 * cell + cell
        let originY = (f.height - totalHeight) / 2
        let y = originY + cell + 0.3 * cell + CGFloat(rows) * cell * 0.5
        board.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x, dy: y)).tap()
    }

    private func waitForHumanTurn(timeout: TimeInterval = 15) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if element("resultTitle").exists { return false }
            let label = element("statusBanner").label
            if label.contains("Du bist am Zug") || label.contains("normaler Wurf") { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }
        return false
    }

    func testCompleteGameAgainstApprentice() {
        app.launch()
        XCTAssertTrue(element("newGameButton").waitForExistence(timeout: 10))
        snapshot("01-main-menu")
        element("newGameButton").tap()
        XCTAssertTrue(element("startGameButton").waitForExistence(timeout: 5))
        element("mode-versusAI").tap()
        element("difficulty-apprentice").tap()
        snapshot("02-new-game")
        element("startGameButton").tap()
        XCTAssertTrue(element("board").waitForExistence(timeout: 5))
        snapshot("03-game-start")

        let order = [3, 2, 4, 3, 1, 5, 2, 4, 0, 6, 3, 1, 5, 0, 6, 2, 4]
        var moves = 0
        var index = 0
        while !element("resultTitle").exists && moves < 40 {
            guard waitForHumanTurn() else { break }
            tapColumn(order[index % order.count])
            index += 1
            moves += 1
            if moves == 4 {
                RunLoop.current.run(until: Date().addingTimeInterval(0.6))
                snapshot("04-mid-game")
            }
        }
        XCTAssertTrue(element("resultTitle").waitForExistence(timeout: 20), "game should end with a result screen")
        RunLoop.current.run(until: Date().addingTimeInterval(1.5))
        snapshot("05-result")
        element("resultMenuButton").tap()
        XCTAssertTrue(element("newGameButton").waitForExistence(timeout: 5))
        XCTAssertTrue(element("statsButton").exists)
        element("statsButton").tap()
        RunLoop.current.run(until: Date().addingTimeInterval(0.8))
        snapshot("06-statistics-after-game")
    }

    func testPauseLeaveAndResumeAfterRestart() {
        app.launchArguments += ["-uiTestingPersist", "-uiTestingReset"]
        app.launch()
        element("newGameButton").tap()
        element("mode-localDuel").tap()
        element("startGameButton").tap()
        XCTAssertTrue(element("board").waitForExistence(timeout: 5))
        tapColumn(3)
        RunLoop.current.run(until: Date().addingTimeInterval(0.8))
        tapColumn(4)
        RunLoop.current.run(until: Date().addingTimeInterval(0.8))
        element("pauseButton").tap()
        XCTAssertTrue(element("resumeButton").waitForExistence(timeout: 3))
        snapshot("07-pause")
        element("leaveButton").tap()
        app.alerts.buttons["Verlassen"].tap()
        XCTAssertTrue(element("resumeGameButton").waitForExistence(timeout: 5), "saved game offered in menu")
        snapshot("08-menu-with-resume")

        // Full restart of the app: the saved duel must still be there and replay correctly.
        app.terminate()
        app.launchArguments = ["-uiTesting", "-uiTestingPersist"]
        app.launch()
        XCTAssertTrue(element("resumeGameButton").waitForExistence(timeout: 10), "saved game survives restart")
        element("resumeGameButton").tap()
        XCTAssertTrue(element("board").waitForExistence(timeout: 5))
        XCTAssertTrue(element("undoButton").isEnabled, "restored history allows undo")
        XCTAssertTrue(element("statusBanner").label.contains("Sonne"), "two moves played, sun to move")
    }

    func testUndoInDuel() {
        app.launch()
        element("newGameButton").tap()
        element("mode-localDuel").tap()
        element("startGameButton").tap()
        XCTAssertTrue(element("board").waitForExistence(timeout: 5))
        XCTAssertFalse(element("undoButton").isEnabled)
        tapColumn(3)
        RunLoop.current.run(until: Date().addingTimeInterval(0.8))
        XCTAssertTrue(element("undoButton").isEnabled)
        element("undoButton").tap()
        RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        XCTAssertFalse(element("undoButton").isEnabled)
    }

    func testTutorialFirstSteps() {
        app.launch()
        element("tutorialButton").tap()
        XCTAssertTrue(element("board").waitForExistence(timeout: 5))
        snapshot("09-tutorial-step1")
        tapColumn(2)
        XCTAssertTrue(element("tutorialNext").waitForExistence(timeout: 5))
        element("tutorialNext").tap()
        RunLoop.current.run(until: Date().addingTimeInterval(0.6))
        tapColumn(5) // wrong column: must be rejected
        RunLoop.current.run(until: Date().addingTimeInterval(0.4))
        XCTAssertFalse(element("tutorialNext").exists)
        snapshot("10-tutorial-wrong-move")
        tapColumn(3)
        XCTAssertTrue(element("tutorialNext").waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.8))
        snapshot("11-tutorial-win")
    }

    func testGeyserPuzzle() {
        app.launch()
        element("puzzlesButton").tap()
        XCTAssertTrue(element("puzzle-p04").waitForExistence(timeout: 5))
        snapshot("12-puzzles")
        element("puzzle-p04").tap()
        XCTAssertTrue(element("board").waitForExistence(timeout: 5))
        element("ability-geyser-sun").tap()
        RunLoop.current.run(until: Date().addingTimeInterval(0.4))
        snapshot("13-geyser-armed")
        tapColumn(2)
        RunLoop.current.run(until: Date().addingTimeInterval(1.2))
        snapshot("14-geyser-solved")
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH 'Gelöst'")).firstMatch.waitForExistence(timeout: 5))
    }

    func testSecondaryScreens() {
        app.launch()
        element("rulesButton").tap()
        RunLoop.current.run(until: Date().addingTimeInterval(0.8))
        snapshot("15-rules")
        app.buttons["Zurück"].tap()
        element("settingsButton").tap()
        RunLoop.current.run(until: Date().addingTimeInterval(0.8))
        snapshot("16-settings")
        app.buttons["Zurück"].tap()
        XCTAssertTrue(element("newGameButton").waitForExistence(timeout: 5))
    }

    func testPortraitDuelLayout() {
        XCUIDevice.shared.orientation = .portrait
        app.launch()
        element("newGameButton").tap()
        element("mode-localDuel").tap()
        element("startGameButton").tap()
        XCTAssertTrue(element("board").waitForExistence(timeout: 5))
        for c in [3, 3, 2, 4] {
            tapColumn(c)
            RunLoop.current.run(until: Date().addingTimeInterval(0.7))
        }
        snapshot("17-portrait-duel")
        XCTAssertTrue(element("panel-sun").exists)
        XCTAssertTrue(element("panel-moon").exists)
    }

    func testUnlockedArenasAtHigherLevel() {
        app.launchArguments += ["-uiTestingLevel", "8"]
        app.launch()
        element("newGameButton").tap()
        element("mode-versusAI").tap()
        element("difficulty-master").tap()
        element("arena-expanse").tap()
        snapshot("18-setup-unlocked")
        element("startGameButton").tap()
        XCTAssertTrue(element("board").waitForExistence(timeout: 5))
        XCTAssertTrue(waitForHumanTurn())
        tapColumn(3, columns: 8, rows: 7)
        RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        XCTAssertTrue(waitForHumanTurn(timeout: 20), "master AI should answer quickly")
        snapshot("19-expanse-vs-master")
    }
}
