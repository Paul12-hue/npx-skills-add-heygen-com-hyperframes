import AVFoundation
import UIKit

enum SoundEffect: CaseIterable {
    case crystal, anchor, geyser, rift, win, lose, draw, invalid, tap, turn
}

/// All sounds are synthesized at launch, so the app ships no third-party audio.
/// Uses the `.ambient` session category: respects the silent switch and mixes with other audio.
final class SoundEngine {
    private let engine = AVAudioEngine()
    private var effectPlayers: [AVAudioPlayerNode] = []
    private let musicPlayer = AVAudioPlayerNode()
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
    private var effects: [SoundEffect: AVAudioPCMBuffer] = [:]
    private var drops: [AVAudioPCMBuffer] = []
    private var musicBuffer: AVAudioPCMBuffer?
    private var nextPlayer = 0
    private var isReady = false

    var effectsEnabled = true
    var musicEnabled = false {
        didSet { musicEnabled ? startMusic() : stopMusic() }
    }

    init() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        } catch {
            print("Audio session error: \(error)")
        }
        for _ in 0..<6 {
            let p = AVAudioPlayerNode()
            engine.attach(p)
            engine.connect(p, to: engine.mainMixerNode, format: format)
            effectPlayers.append(p)
        }
        engine.attach(musicPlayer)
        engine.connect(musicPlayer, to: engine.mainMixerNode, format: format)
        musicPlayer.volume = 0.32
        engine.mainMixerNode.outputVolume = 0.8

        for e in SoundEffect.allCases { effects[e] = render(e) }
        drops = (0..<8).map { renderDrop(row: $0) }
        startEngine()

        NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: raw) == .ended else { return }
            self?.resume()
        }
        NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            self?.resume()
        }
    }

    /// Restarts the engine after interruptions or when the app becomes active again.
    func resume() {
        startEngine()
        if musicEnabled { startMusic() }
    }

    func play(_ effect: SoundEffect) {
        guard effectsEnabled, let buffer = effects[effect] else { return }
        schedule(buffer)
    }

    /// Pluck whose pitch rises with the landing row.
    func playDrop(row: Int) {
        guard effectsEnabled, !drops.isEmpty else { return }
        schedule(drops[min(max(row, 0), drops.count - 1)])
    }

    private func schedule(_ buffer: AVAudioPCMBuffer) {
        if !engine.isRunning { startEngine() }
        guard isReady else { return }
        let player = effectPlayers[nextPlayer]
        nextPlayer = (nextPlayer + 1) % effectPlayers.count
        player.stop()
        player.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
        player.play()
    }

    private func startEngine() {
        guard !engine.isRunning else { isReady = true; return }
        do {
            try AVAudioSession.sharedInstance().setActive(true)
            try engine.start()
            isReady = true
        } catch {
            isReady = false
            print("Audio engine failed to start: \(error)")
        }
    }

    private func startMusic() {
        guard musicEnabled else { return }
        if let buffer = musicBuffer {
            if !engine.isRunning { startEngine() }
            guard isReady, !musicPlayer.isPlaying else { return }
            musicPlayer.scheduleBuffer(buffer, at: nil, options: [.loops], completionHandler: nil)
            musicPlayer.play()
            return
        }
        // Render the ambient loop off the main thread the first time it is needed.
        let format = self.format
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let buffer = SoundEngine.renderMusic(format: format)
            DispatchQueue.main.async {
                self?.musicBuffer = buffer
                self?.startMusic()
            }
        }
    }

    private func stopMusic() {
        musicPlayer.stop()
    }

    // MARK: Synthesis

    private func buffer(duration: Double, _ sample: (Double) -> Double) -> AVAudioPCMBuffer {
        Self.makeBuffer(format: format, duration: duration, sample)
    }

    private static func makeBuffer(format: AVAudioFormat, duration: Double, _ sample: (Double) -> Double) -> AVAudioPCMBuffer {
        let rate = format.sampleRate
        let frames = AVAudioFrameCount(duration * rate)
        let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
        buf.frameLength = frames
        let data = buf.floatChannelData![0]
        for i in 0..<Int(frames) {
            let t = Double(i) / rate
            // Short fade in/out avoids clicks.
            let edge = min(1, t / 0.004, (duration - t) / 0.02)
            data[i] = Float(max(-1, min(1, sample(t) * edge)))
        }
        return buf
    }

    private func renderDrop(row: Int) -> AVAudioPCMBuffer {
        let f = 392 * pow(2, Double(row) * 2 / 12)
        return buffer(duration: 0.32) { t in
            let env = exp(-t * 14)
            let body = sin(2 * .pi * f * t) + 0.35 * sin(2 * .pi * f * 2 * t) * exp(-t * 30)
            let thump = sin(2 * .pi * 95 * t) * exp(-t * 35)
            return 0.32 * env * body + 0.35 * thump
        }
    }

    private func render(_ effect: SoundEffect) -> AVAudioPCMBuffer {
        var noise = SoundNoise()
        switch effect {
        case .crystal:
            return buffer(duration: 1.1) { t in
                let e = exp(-t * 4.5)
                return 0.22 * e * (sin(2 * .pi * 1318.5 * t) + 0.6 * sin(2 * .pi * 1975.5 * t) + 0.3 * sin(2 * .pi * 2637 * t + 0.3))
            }
        case .anchor:
            return buffer(duration: 0.55) { t in
                let e = exp(-t * 9)
                return 0.45 * e * (sin(2 * .pi * 110 * t) + 0.5 * sin(2 * .pi * 55 * t)) + 0.12 * noise.next() * exp(-t * 60)
            }
        case .geyser:
            var low = 0.0
            return buffer(duration: 0.7) { t in
                let cutoff = 0.02 + 0.25 * (t / 0.7)
                low += cutoff * (noise.next() - low)
                let f = 180 + 700 * t
                let env = sin(.pi * min(1, t / 0.7))
                return env * (0.5 * low + 0.18 * sin(2 * .pi * f * t))
            }
        case .rift:
            return buffer(duration: 0.45) { t in
                let f = 900 * exp(-t * 4)
                return 0.35 * noise.next() * exp(-t * 22) + 0.25 * sin(2 * .pi * f * t) * exp(-t * 7)
            }
        case .win:
            let notes: [Double] = [523.25, 659.25, 783.99, 1046.5]
            return buffer(duration: 1.6) { t in
                var s = 0.0
                for (i, f) in notes.enumerated() {
                    let start = Double(i) * 0.11
                    guard t >= start else { continue }
                    let lt = t - start
                    s += exp(-lt * 3.2) * (sin(2 * .pi * f * lt) + 0.25 * sin(2 * .pi * f * 2 * lt))
                }
                return 0.16 * s
            }
        case .lose:
            let notes: [Double] = [440, 349.23, 293.66]
            return buffer(duration: 1.4) { t in
                var s = 0.0
                for (i, f) in notes.enumerated() {
                    let start = Double(i) * 0.22
                    guard t >= start else { continue }
                    let lt = t - start
                    s += exp(-lt * 3) * sin(2 * .pi * f * lt)
                }
                return 0.2 * s
            }
        case .draw:
            return buffer(duration: 0.9) { t in
                0.18 * exp(-t * 4) * (sin(2 * .pi * 587.33 * t) + sin(2 * .pi * 587.33 * 1.5 * t) * 0.5)
            }
        case .invalid:
            return buffer(duration: 0.22) { t in
                let pulse = t < 0.08 || (t > 0.12 && t < 0.2) ? 1.0 : 0.0
                return 0.22 * pulse * (sin(2 * .pi * 150 * t) + 0.3 * sin(2 * .pi * 300 * t))
            }
        case .tap:
            return buffer(duration: 0.06) { t in 0.25 * sin(2 * .pi * 1800 * t) * exp(-t * 90) }
        case .turn:
            return buffer(duration: 0.16) { t in 0.14 * sin(2 * .pi * 880 * t) * exp(-t * 22) }
        }
    }

    /// 32-second ambient loop: slow pad chords (Am–F–C–G) plus sparse pentatonic bells.
    private static func renderMusic(format: AVAudioFormat) -> AVAudioPCMBuffer {
        let chords: [[Double]] = [
            [110, 164.81, 220, 261.63, 329.63],
            [87.31, 130.81, 174.61, 220, 261.63],
            [130.81, 196, 261.63, 329.63, 392],
            [98, 146.83, 196, 246.94, 293.66],
        ]
        let bells: [(Double, Double)] = [(1.5, 659.25), (5.2, 783.99), (9.6, 587.33), (13.1, 523.25), (17.4, 659.25),
                                         (21.0, 880), (25.3, 783.99), (28.8, 587.33)]
        let chordLength = 8.0
        let total = chordLength * Double(chords.count)
        return makeBuffer(format: format, duration: total) { t in
            var s = 0.0
            for ci in 0..<chords.count {
                // Each chord fades over a window wider than its slot; the window wraps around the loop seam.
                var local = t - Double(ci) * chordLength
                if local > total - 1.5 { local -= total }
                if local < -1.5 { local += total }
                guard local > -1.5 && local < chordLength + 1.5 else { continue }
                let w = sin(.pi * (local + 1.5) / (chordLength + 3))
                let env = w * w
                for (n, f) in chords[ci].enumerated() {
                    s += env * 0.05 * (sin(2 * .pi * f * t) + 0.4 * sin(2 * .pi * f * 1.003 * t + Double(n)))
                }
            }
            for (start, f) in bells where t >= start && t < start + 3 {
                let lt = t - start
                s += 0.06 * exp(-lt * 1.6) * sin(2 * .pi * f * lt)
            }
            return s
        }
    }
}

/// Tiny deterministic noise source for synthesis.
private struct SoundNoise {
    private var state: UInt32 = 0x1234_5678
    mutating func next() -> Double {
        state = state &* 1_664_525 &+ 1_013_904_223
        return Double(state >> 8) / Double(1 << 24) * 2 - 1
    }
}

/// Haptic feedback (silently does nothing on iPads without a Taptic Engine).
final class Haptics {
    var enabled = true
    private let light = UIImpactFeedbackGenerator(style: .light)
    private let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private let notify = UINotificationFeedbackGenerator()

    func drop() { if enabled { light.impactOccurred() } }
    func ability() { if enabled { heavy.impactOccurred() } }
    func error() { if enabled { notify.notificationOccurred(.error) } }
    func success() { if enabled { notify.notificationOccurred(.success) } }
}
