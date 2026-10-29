import SwiftUI
import KaskadeCore

/// Faction card: name, turn indicator, energy and the three ability buttons.
struct PlayerPanel: View {
    let controller: GameController
    let player: Player
    var compact: Bool

    private var state: GameState { controller.state }
    private var colors: StonePalette { controller.palette.palette(for: player) }
    private var isActive: Bool { state.outcome == .ongoing && state.toMove == player }
    private var isHumanControlled: Bool { controller.match.config.aiPlayer != player && controller.kind != .tutorial || (controller.kind == .tutorial && player == .sun) }

    var body: some View {
        let content = VStack(alignment: .leading, spacing: compact ? 10 : 16) {
            header
            if state.abilitiesEnabled {
                energyRow
                abilities
            } else {
                Text("Klassische Regeln, ohne Fähigkeiten.")
                    .font(Theme.body(14))
                    .foregroundStyle(Theme.textMuted)
            }
        }
        .padding(compact ? 14 : 20)
        .frame(maxWidth: compact ? .infinity : 260, alignment: .leading)
        .glassPanel(cornerRadius: 26, highlighted: isActive ? colors.glow.opacity(0.9) : nil)
        .animation(.easeInOut(duration: 0.3), value: isActive)

        content
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("panel-\(player == .sun ? "sun" : "moon")")
    }

    private var header: some View {
        HStack(spacing: 12) {
            StoneView(owner: StoneOwner(player), palette: controller.palette, diameter: compact ? 34 : 44, highlighted: isActive)
            VStack(alignment: .leading, spacing: 2) {
                Text(controller.displayName(for: player))
                    .font(Theme.heading(compact ? 18 : 21))
                    .foregroundStyle(Theme.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                turnLabel
            }
            Spacer(minLength: 0)
        }
    }

    @ViewBuilder private var turnLabel: some View {
        if isActive {
            if controller.aiThinking {
                ThinkingDots(color: colors.glow)
            } else {
                Text(state.awaitingFollowUpDrop ? "Wirf jetzt" : "Am Zug")
                    .font(Theme.label(13))
                    .foregroundStyle(colors.glow)
            }
        } else {
            Text(player == .sun ? "Sonne" : "Mond")
                .font(Theme.label(13))
                .foregroundStyle(Theme.textMuted)
        }
    }

    private var energyRow: some View {
        HStack(spacing: 10) {
            Image(systemName: "bolt.fill")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Theme.energy)
            EnergyMeter(energy: state.energy(of: player), max: state.maxEnergy, compact: compact)
            Spacer(minLength: 0)
            if state.energy(of: player) >= Ability.rift.cost {
                Text("Spalt bereit")
                    .font(Theme.label(11))
                    .foregroundStyle(Theme.danger)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Capsule().fill(Theme.danger.opacity(0.15)))
                    .accessibilityLabel("Spalt bereit")
            }
        }
    }

    private var abilities: some View {
        let layout = compact ? AnyLayout(HStackLayout(spacing: 8)) : AnyLayout(VStackLayout(spacing: 8))
        return layout {
            ForEach(Ability.allCases, id: \.self) { ability in
                AbilityButton(ability: ability,
                              armed: isActive && controller.armedAbility == ability,
                              affordable: state.energy(of: player) >= ability.cost,
                              usable: isActive && isHumanControlled && controller.isHumanTurn && controller.canAfford(ability),
                              focus: controller.tutorialStep?.focusAbility == ability && isActive,
                              compact: compact) {
                    // Only the side to move can arm its abilities.
                    if isActive && isHumanControlled { controller.toggleAbility(ability) }
                }
                .accessibilityIdentifier("ability-\(ability.rawValue)-\(player == .sun ? "sun" : "moon")")
            }
        }
    }
}

struct AbilityButton: View {
    let ability: Ability
    let armed: Bool
    let affordable: Bool
    let usable: Bool
    let focus: Bool
    let compact: Bool
    let action: () -> Void
    @State private var pulse = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                AbilityIcon(ability: ability, size: compact ? 22 : 26, color: armed ? Color(hex: 0x0B1128) : Theme.textPrimary)
                if !compact {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(ability.displayName)
                            .font(Theme.heading(16))
                        Text(ability.shortRule)
                            .font(Theme.body(11))
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                            .opacity(0.75)
                    }
                } else {
                    Text(ability.displayName).font(Theme.heading(14))
                }
                Spacer(minLength: 0)
                CostPips(cost: ability.cost)
            }
            .foregroundStyle(armed ? Color(hex: 0x0B1128) : Theme.textPrimary)
            .padding(.horizontal, 12)
            .frame(minHeight: compact ? 48 : 60)
            .frame(maxWidth: .infinity)
            .background {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(armed ? AnyShapeStyle(LinearGradient(colors: [Theme.crystal, Theme.crystalDeep], startPoint: .top, endPoint: .bottom))
                                : AnyShapeStyle(Color.white.opacity(usable ? 0.1 : 0.04)))
            }
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(focus ? Theme.energy : Color.white.opacity(armed ? 0.6 : 0.12), lineWidth: focus ? 2.5 : 1)
                    .scaleEffect(focus && pulse ? 1.04 : 1)
            }
            .opacity(affordable ? 1 : 0.45)
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("\(ability.displayName), kostet \(ability.cost) Energie")
        .accessibilityHint(ability.shortRule)
        .accessibilityAddTraits(armed ? .isSelected : [])
        .onAppear {
            withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { pulse = true }
        }
    }
}

struct ThinkingDots: View {
    let color: Color
    @State private var phase = 0.0

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 20)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(color)
                        .frame(width: 6, height: 6)
                        .opacity(0.3 + 0.7 * max(0, sin(t * 5 - Double(i) * 0.8)))
                }
                Text("denkt")
                    .font(Theme.label(13))
                    .foregroundStyle(color)
            }
        }
        .accessibilityLabel("denkt nach")
    }
}
