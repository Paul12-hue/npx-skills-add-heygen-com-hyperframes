import SwiftUI

@main
struct KaskadeApp: App {
    @State private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .preferredColorScheme(.dark)
                .tint(Theme.crystal)
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .background, .inactive: model.appDidEnterBackground()
            case .active: model.appDidBecomeActive()
            @unknown default: break
            }
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        ZStack {
            CanyonBackground(reduceMotion: app.settings.reduceMotion)
            Group {
                switch app.screen {
                case .menu: MainMenuView()
                case .newGame: NewGameView()
                case .game:
                    if let game = app.game { GameView(controller: game) } else { MainMenuView() }
                case .puzzles: PuzzleListView()
                case .rules: RulesView()
                case .stats: StatsView()
                case .settings: SettingsView()
                }
            }
            .transition(.asymmetric(insertion: .opacity.combined(with: .scale(scale: 0.98)), removal: .opacity))
            .id(app.screen)
        }
    }
}
