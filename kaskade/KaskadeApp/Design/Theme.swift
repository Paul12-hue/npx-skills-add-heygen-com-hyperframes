import SwiftUI
import KaskadeCore

/// Central color palette and typography of KASKADE ("night canyon" identity).
enum Theme {
    // Backgrounds
    static let abyss = Color(hex: 0x070B17)
    static let night = Color(hex: 0x0E1630)
    static let dusk = Color(hex: 0x1B2550)
    static let mist = Color(hex: 0x2B3A73)

    // Surfaces
    static let glass = Color.white.opacity(0.07)
    static let glassStrong = Color.white.opacity(0.12)
    static let hairline = Color.white.opacity(0.14)

    // Text
    static let textPrimary = Color(hex: 0xF4F1EA)
    static let textSecondary = Color(hex: 0xB8C0DC)
    static let textMuted = Color(hex: 0x7C86AA)

    // Accents
    static let crystal = Color(hex: 0x7FF5E1)
    static let crystalDeep = Color(hex: 0x2FC4B2)
    static let energy = Color(hex: 0xFFE27A)
    static let danger = Color(hex: 0xFF6B6B)
    static let success = Color(hex: 0x6BE39B)

    static let background = LinearGradient(colors: [night, abyss], startPoint: .top, endPoint: .bottom)

    // Typography: SF Rounded keeps a friendly, game-like tone with excellent legibility.
    static func title(_ size: CGFloat) -> Font { .system(size: size, weight: .heavy, design: .rounded) }
    static func heading(_ size: CGFloat) -> Font { .system(size: size, weight: .bold, design: .rounded) }
    static func body(_ size: CGFloat = 17) -> Font { .system(size: size, weight: .medium, design: .rounded) }
    static func label(_ size: CGFloat = 13) -> Font { .system(size: size, weight: .semibold, design: .rounded) }
}

/// Colors for one faction's stones under a given skin.
struct StonePalette {
    var light: Color
    var base: Color
    var deep: Color
    var glow: Color
}

struct SkinPalette {
    var sun: StonePalette
    var moon: StonePalette

    func palette(for player: Player) -> StonePalette { player == .sun ? sun : moon }

    static let neutral = StonePalette(light: Color(hex: 0xA7ADC2), base: Color(hex: 0x5D6380), deep: Color(hex: 0x2C3049), glow: Color(hex: 0x9AA3C7))

    static func forSkin(_ id: String) -> SkinPalette {
        switch id {
        case "coral":
            return SkinPalette(
                sun: StonePalette(light: Color(hex: 0xFFC1B0), base: Color(hex: 0xFF6F61), deep: Color(hex: 0xB23A48), glow: Color(hex: 0xFF8A7A)),
                moon: StonePalette(light: Color(hex: 0xB9F5D0), base: Color(hex: 0x2EC4A0), deep: Color(hex: 0x0F6E6A), glow: Color(hex: 0x5FF0C4)))
        case "aurum":
            return SkinPalette(
                sun: StonePalette(light: Color(hex: 0xFFF1B8), base: Color(hex: 0xE8B931), deep: Color(hex: 0x9A6B0F), glow: Color(hex: 0xFFD54F)),
                moon: StonePalette(light: Color(hex: 0x8C8FA8), base: Color(hex: 0x34364A), deep: Color(hex: 0x0D0E16), glow: Color(hex: 0xB49CFF)))
        case "aurora":
            return SkinPalette(
                sun: StonePalette(light: Color(hex: 0xE6FFB0), base: Color(hex: 0x9BE15D), deep: Color(hex: 0x2E8B57), glow: Color(hex: 0xC6FF7A)),
                moon: StonePalette(light: Color(hex: 0xF3C6FF), base: Color(hex: 0xB065F5), deep: Color(hex: 0x5A2A9C), glow: Color(hex: 0xD58CFF)))
        case "nebula":
            return SkinPalette(
                sun: StonePalette(light: Color(hex: 0xFFD6F5), base: Color(hex: 0xF25FB8), deep: Color(hex: 0x8E1D6B), glow: Color(hex: 0xFF8AD8)),
                moon: StonePalette(light: Color(hex: 0xC9F0FF), base: Color(hex: 0x3FA9F5), deep: Color(hex: 0x123E8C), glow: Color(hex: 0x7CCBFF)))
        default:
            return SkinPalette(
                sun: StonePalette(light: Color(hex: 0xFFE2A8), base: Color(hex: 0xFFA733), deep: Color(hex: 0xC2410C), glow: Color(hex: 0xFFB347)),
                moon: StonePalette(light: Color(hex: 0xD3F3FF), base: Color(hex: 0x5CC8FF), deep: Color(hex: 0x3346C9), glow: Color(hex: 0x7CE7FF)))
        }
    }
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: opacity)
    }
}

extension Player {
    var symbolName: String { self == .sun ? "sun.max.fill" : "moon.stars.fill" }
}

extension Ability {
    var displayName: String {
        switch self {
        case .anchor: return "Anker"
        case .geyser: return "Geysir"
        case .rift: return "Spalt"
        }
    }

    var shortRule: String {
        switch self {
        case .anchor: return "Neutraler Stein, dann wirfst du normal."
        case .geyser: return "Eigener Stein von unten, die Spalte steigt."
        case .rift: return "Obersten Stein entfernen, dann wirfst du."
        }
    }
}
