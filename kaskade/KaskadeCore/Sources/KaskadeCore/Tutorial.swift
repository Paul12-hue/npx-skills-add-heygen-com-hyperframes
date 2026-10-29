/// One step of the interactive tutorial. The player must perform one of `allowedTurns`
/// (a turn is one or two moves, e.g. anchor + drop). The opponent's answer is scripted.
public struct TutorialStep: Identifiable, Sendable {
    public let id: Int
    public let title: String
    public let instruction: String
    /// Shown after the step is done.
    public let success: String
    public let layout: [String]
    public let energySun: Int
    public let energyMoon: Int
    /// Accepted turns. Empty = any legal drop.
    public let allowedTurns: [[Move]]
    /// Scripted moon reply after the player's turn (if the game is still running).
    public let reply: [Move]
    /// Ability buttons the step wants to highlight.
    public let focusAbility: Ability?

    public func makeState() -> GameState {
        Puzzle(id: "tutorial-\(id)", title: title, goal: "", hint: "", layout: layout, toMove: .sun,
               energySun: energySun, energyMoon: energyMoon, abilitiesEnabled: true, turns: 1).makeState()
    }

    /// Columns the UI should highlight for the next action, given the moves already made this turn.
    public func highlightedColumns(after partial: [Move]) -> [Int] {
        var columns = Set<Int>()
        for turn in allowedTurns where turn.count > partial.count && Array(turn.prefix(partial.count)) == partial {
            columns.insert(turn[partial.count].column)
        }
        return columns.sorted()
    }

    /// Whether `move` keeps the player on an accepted path.
    public func accepts(_ move: Move, after partial: [Move]) -> Bool {
        if allowedTurns.isEmpty { return move.kind == .drop }
        let candidate = partial + [move]
        return allowedTurns.contains { $0.count >= candidate.count && Array($0.prefix(candidate.count)) == candidate }
    }

    public func completes(_ partial: [Move]) -> Bool {
        if allowedTurns.isEmpty { return partial.count == 1 }
        return allowedTurns.contains(partial)
    }
}

public enum Tutorial {
    public static let steps: [TutorialStep] = [
        TutorialStep(
            id: 1, title: "Steine werfen",
            instruction: "Tippe auf eine Spalte. Dein Stein fällt auf den tiefsten freien Platz.",
            success: "Genau so. Danach ist der Mond am Zug.",
            layout: [".......", ".......", ".......", ".......", ".......", "......."],
            energySun: 0, energyMoon: 0, allowedTurns: [], reply: [.drop(3)], focusAbility: nil),
        TutorialStep(
            id: 2, title: "Vier in einer Reihe",
            instruction: "Vier eigene Steine in einer Reihe gewinnen: waagerecht, senkrecht oder diagonal. Vollende die Reihe.",
            success: "Sieg! Das ist schon die ganze Grundregel.",
            layout: [".......", ".......", ".......", ".......", "MMM....", "SSS...."],
            energySun: 0, energyMoon: 0, allowedTurns: [[.drop(3)]], reply: [], focusAbility: nil),
        TutorialStep(
            id: 3, title: "Blocken",
            instruction: "Der Mond hat drei Steine in einer Reihe. Stoppe ihn, bevor er die vierte Lücke füllt.",
            success: "Abgewehrt. Achte immer auf die Drohungen deines Gegners.",
            layout: [".......", ".......", ".......", ".......", "S......", "MMM.S.."],
            energySun: 0, energyMoon: 0, allowedTurns: [[.drop(3)]], reply: [.drop(5)], focusAbility: nil),
        TutorialStep(
            id: 4, title: "Kristalle",
            instruction: "Kristalle schweben in leeren Feldern. Wer ein Kristallfeld zuerst besetzt, erhält 1 Energie. Hol dir den Kristall.",
            success: "+1 Energie! Energie bezahlt deine Fähigkeiten.",
            layout: [".......", ".......", ".......", ".......", "..*....", "..M.S.."],
            energySun: 1, energyMoon: 0, allowedTurns: [[.drop(2)]], reply: [.drop(4)], focusAbility: nil),
        TutorialStep(
            id: 5, title: "Anker (2 Energie)",
            instruction: "Deine Reihe braucht ein Feld, das noch in der Luft hängt. Setze einen Anker in die markierte Spalte und wirf dann deinen Stein darauf.",
            success: "Der neutrale Anker trägt deinen Stein. Er zählt für niemanden.",
            layout: [".......", ".......", ".......", ".......", ".SSS...", ".MMM..."],
            energySun: 2, energyMoon: 0,
            allowedTurns: [[.anchor(4), .drop(4)], [.anchor(0), .drop(0)]], reply: [], focusAbility: .anchor),
        TutorialStep(
            id: 6, title: "Geysir (2 Energie)",
            instruction: "Der Geysir schiebt deinen Stein von unten in eine Spalte, alles darüber steigt eine Reihe auf. Hebe die markierte Spalte an und vollende die Diagonale.",
            success: "Ausbruch! Ein Geysir verändert Waagerechte und Diagonalen auf einmal.",
            layout: Puzzle.named("p04")!.layout,
            energySun: 2, energyMoon: 0, allowedTurns: [[.geyser(2)]], reply: [], focusAbility: .geyser),
        TutorialStep(
            id: 7, title: "Spalt (3 Energie)",
            instruction: "Ein Mondstein blockiert deine Reihe. Der Spalt entfernt den obersten Stein einer Spalte, danach wirfst du sofort selbst.",
            success: "Durchbruch! Steht der Gegner auf 3 Energie, reicht ein einzelner Block nicht.",
            layout: Puzzle.named("p05")!.layout,
            energySun: 3, energyMoon: 0, allowedTurns: [[.rift(3), .drop(3)]], reply: [], focusAbility: .rift),
    ]
}
