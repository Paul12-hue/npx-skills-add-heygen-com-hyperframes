// DR. SPIN's lines. Shuffle bags guarantee no line repeats until its pool is exhausted.

import type { Mood } from '../render/DrSpinBot';

export type LineKey =
  | 'greet' | 'perfect' | 'hit' | 'net' | 'netcord' | 'long' | 'wide' | 'short' | 'own' | 'obstacle'
  | 'close' | 'slow' | 'ring' | 'combo' | 'curve' | 'tunnel' | 'nitro' | 'magnet' | 'bounce' | 'quantum'
  | 'gravity' | 'pass' | 'fail' | 'finaleWin' | 'finaleFail' | 'idle' | 'pause' | 'firstShot' | 'record';

const L: Record<LineKey, { mood: Mood; lines: string[] }> = {
  greet: { mood: 'smug', lines: [
    'Willkommen im Labor. Bitte nichts anfassen, außer den Ball.',
    'Ah, Besuch. Endlich jemand, der den Ball nicht nur theoretisch schlägt.',
    'Systeme bereit. Ich auch. Meistens.',
  ] },
  firstShot: { mood: 'talk', lines: [
    'Nach oben wischen zum Schlagen. Rechts unten bestimmst du, wo du den Ball triffst. Den Rest erledigt die Physik.',
  ] },
  perfect: { mood: 'happy', lines: [
    'Physikalisch betrachtet war das ein Fehler. Sportlich betrachtet war es Kunst.',
    'Ich habe 14 Millionen Schlagvarianten berechnet. Du hast dich für die interessanteste entschieden.',
    'Experiment erfolgreich. Der Tisch hat sich beschwert.',
    'Volltreffer. Ich muss meine Modelle neu kalibrieren. Schon wieder.',
    'Diese Präzision ist offiziell verdächtig.',
  ] },
  hit: { mood: 'happy', lines: [
    'Treffer. Ich notiere: Proband ist gefährlich kompetent.',
    'Im Zielfeld. Meine Statistik ist beleidigt, aber beeindruckt.',
    'Sauber. Fast so sauber wie mein Quellcode.',
    'Das Zielfeld meldet Kontakt. Es klingt glücklich.',
    'Notiert. Und unterstrichen.',
  ] },
  net: { mood: 'sad', lines: [
    'Das Netz bedankt sich für die Aufmerksamkeit.',
    'Das war kein Fehlschlag. Das war eine unerwartete Datenerhebung über Netze.',
    'Netzkontakt. Das Netz hat heute mehr Ballkontakte als du.',
    'Ein bisschen höher. Ungefähr einen Ball höher.',
  ] },
  netcord: { mood: 'shocked', lines: [
    'Netzkante! Die Wahrscheinlichkeit dafür lag bei Glück.',
    'Der Ball ist über die Netzkante gekrochen. Ich ziehe meinen Hut. Ich habe keinen Hut.',
  ] },
  long: { mood: 'smug', lines: [
    'Der Ball hat die Atmosphäre fast verlassen. Weniger Kraft, bitte.',
    'Zu lang. Der Ball sucht jetzt einen neuen Tisch.',
    'Das war kein Fehlschlag. Das war eine unerwartete Datenerhebung.',
    'Etwas weniger Energie. Wir sind ein Labor, keine Raketenbasis.',
  ] },
  wide: { mood: 'smug', lines: [
    'Seitlich vorbei. Der Tisch ist da vorne. Der große blaue Gegenstand.',
    'Interessante Flugbahn. Leider in die falsche Dimension.',
  ] },
  short: { mood: 'sad', lines: [
    'Zu kurz. Der Ball hat auf halber Strecke die Motivation verloren.',
    'Etwas mehr Kraft. Der Ball braucht Ermutigung.',
  ] },
  own: { mood: 'smug', lines: [
    'Erster Aufprall auf deiner Seite. Das war ein Aufschlag, kein Schlag.',
    'Der Ball wollte wohl erst mal bei dir bleiben. Rührend. Aber ungültig.',
  ] },
  obstacle: { mood: 'shocked', lines: [
    'Das Hindernis hat gewonnen. Hindernisse gewinnen oft. Darum heißen sie so.',
    'Kollision registriert. Das Hindernis bleibt standhaft. Wie meine Meinung.',
  ] },
  close: { mood: 'thinking', lines: [
    'Knapp daneben. Ich nenne es: fast Wissenschaft.',
    'Nah dran. In Ballbreiten gemessen beinahe genial.',
    'Daneben, aber mit Stil. Stil gibt hier leider keine Punkte.',
  ] },
  slow: { mood: 'thinking', lines: [
    'Getroffen, aber zu langsam für die Lichtschranke. Sie hat geschlafen.',
    'Die Lichtschranke verlangt Tempo. Das hier war eher Spaziergang.',
  ] },
  ring: { mood: 'thinking', lines: [
    'Am Ring vorbei. Der Ring ist rund, der Weg dahin leider nicht.',
    'Der Ring bleibt unberührt. Wie meine Urlaubstage.',
  ] },
  combo: { mood: 'happy', lines: [
    'Serie! Der Ball hat mehr Spin als mein gesamtes Betriebssystem.',
    'Kombo läuft. Bitte nicht aufhören, ich schreibe gerade ein Paper.',
    'Noch ein Treffer. Die Wahrscheinlichkeit für einen normalen Ballwechsel wurde soeben erfolgreich eliminiert.',
  ] },
  curve: { mood: 'shocked', lines: [
    'Diese Kurve verstößt gegen mindestens drei Laborrichtlinien.',
    'Der Magnus-Effekt hat gerade Überstunden gemacht.',
  ] },
  tunnel: { mood: 'shocked', lines: [
    'Quantentunnel bestätigt. Die Wand weiß nicht, was passiert ist. Ich auch nicht ganz.',
    'Der Ball war gleichzeitig vor und hinter der Wand. Typisch Quantenstaub.',
  ] },
  nitro: { mood: 'talk', lines: [
    'Liquid Nitro. Schneller, härter, kälter. Mehr Grip für den Spin. Handschuhe empfohlen.',
    'Flüssiger Stickstoff mit Zusatzstoff Omega. Bitte nicht trinken. Wieder.',
  ] },
  magnet: { mood: 'talk', lines: [
    'Magnetic Gel. Zieht den Ball seitlich zum Zielfeld. Die Länge musst du trotzdem selbst treffen.',
    'Magnetgel aufgetragen. Es ist anhänglich. Wie ein Praktikant.',
  ] },
  bounce: { mood: 'talk', lines: [
    'Super Bounce. Restitution 1,4. Er springt höher, als er fällt. Die Thermodynamik ist informiert.',
    'Super Bounce geladen. Bitte Decke im Auge behalten.',
  ] },
  quantum: { mood: 'talk', lines: [
    'Quantum Dust. Tunnelt durch Hindernisse. Und am Netz kippt der Seitenspin. Fragen Sie nicht warum.',
    'Quantenstaub. Er ist unberechenbar. Aber konsequent unberechenbar.',
  ] },
  gravity: { mood: 'shocked', lines: [
    'Bitte bleiben Sie ruhig. Die Gravitation befindet sich nur kurz in der Wartung.',
    'Schwerkraft-Update wird installiert. Bitte Ball nicht ausschalten.',
    'Gravitation schwankt. Ich auch ein bisschen.',
  ] },
  pass: { mood: 'happy', lines: [
    'Experiment bestanden. Ich bereite die Nobelpreis-Rede vor. Meine natürlich.',
    'Erfolgreich abgeschlossen. Die Daten sind wunderschön. Ich habe kurz geweint. Intern.',
    'Bestanden. Ich erhöhe deine Sicherheitsfreigabe auf Stufe Orange.',
  ] },
  fail: { mood: 'sad', lines: [
    'Nicht bestanden. Aber die Fehlschläge waren lehrreich. Für den Ball.',
    'Experiment nicht bestanden. Ich nenne es: Vorstudie.',
  ] },
  finaleWin: { mood: 'happy', lines: [
    'Ich werde dieses Ergebnis aus wissenschaftlichen Gründen nicht meinem Vorgesetzten melden.',
  ] },
  finaleFail: { mood: 'smug', lines: [
    'Die Simulation sagt: unmöglich. Die Simulation grinst gerade.',
    'Fast. Wobei fast in der Physik ein sehr großes Wort ist.',
    'Der Monolith hat gewonnen. Er hat aber auch keinen Trainer.',
    'Noch ein Versuch. Ich habe Zeit. Ich bin ein Roboter.',
    'Das Unmögliche braucht manchmal ein paar Anläufe. Oder einen neuen Ball.',
  ] },
  idle: { mood: 'thinking', lines: [
    'Ich warte. Ich kann sehr gut warten. Ich bin quasi Profi im Warten.',
    'Der Ball wird nicht jünger. Ich übrigens auch nicht.',
    'Tipp: nach oben wischen. Der Ball wartet nicht ewig. Doch, eigentlich schon.',
  ] },
  pause: { mood: 'idle', lines: [
    'Pause. Ich nutze die Zeit für ein Firmware-Nickerchen.',
    'Experiment angehalten. Die Gravitation macht auch kurz Pause.',
  ] },
  record: { mood: 'shocked', lines: [
    'Neuer Rekord! Ich muss die Bestenliste neu formatieren.',
    'Rekord! Bitte Ruhe bewahren, ich hole die Konfetti-Kanone. Wir haben keine. Stell sie dir vor.',
  ] },
};

const bags = new Map<LineKey, string[]>();

export function pickLine(key: LineKey): { text: string; mood: Mood } {
  const def = L[key];
  let bag = bags.get(key);
  if (!bag || bag.length === 0) {
    bag = [...def.lines].sort(() => Math.random() - 0.5);
    bags.set(key, bag);
  }
  return { text: bag.pop()!, mood: def.mood };
}
