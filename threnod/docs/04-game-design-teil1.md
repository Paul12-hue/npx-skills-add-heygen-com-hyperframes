# THRENOD · Phase 4, Teil 1: Kernsysteme

**Status:** ✅ Freigegeben. Entscheidungen: G1 B (einfacher, ohne Poise) · G2 feste Lieder · G3 Gegner kehren nur im Hush und in Dungeons zurück · G4 Nebenhand ja
Alle Zahlen sind **Startwerte für das Balancing**.

---

## 1. Werte der Spielfigur

Es gibt keine Attribute zum Verteilen. Die Werte ergeben sich aus den Rängen der Pfade.

| Wert | Wirkung | Steigt durch |
|---|---|---|
| **Vigor** | `HP = 40 + 8 × Vigor` | Bulwark, Blade |
| **Might** | Nahkampfschaden | Blade |
| **Finesse** | Krit-Chance, Initiative, Fliehen, Schleichen, Schlösser | Shadow |
| **Voice** | Stärke der Lieder | Song |
| **Resolve** | Widerstand gegen Flüche und Furcht, Heilwirkung | Faith, Bulwark |

## 2. Kampfsystem: nahtlose rundenbasierte Duelle

### 2.1 Kampfbeginn
- Wenn du einen Gegner berührst oder er dich bemerkt, friert die Szene ein, und der Kampf läuft an diesem Ort ab.
- **Hinterhalt:** Du hast den ersten Zug, volle Breath und einen garantierten Krit.
- **Überrascht:** Der Gegner beginnt, und du startest mit halber Breath.
- Du kämpfst gegen 1 bis 3 Gegner, Bosse eventuell mit Dienern.

### 2.2 Der Zug
**Ein Zug ist eine Aktion.** Sie kostet **Breath**: Maximal 6, und zu Beginn jedes eigenen Zuges kommen 2 dazu.

| Aktion | Breath | Wirkung |
|---|---|---|
| **Strike** | 1 | Normaler Schaden |
| **Heavy Strike** | 3 | 180 % Schaden, **unterbricht** gegnerische Aufladungen und Lieder |
| **Guard** | 0 | Halber Schaden bis zum nächsten Zug, +1 Breath extra |
| **Evade** | 2 | Weicht dem nächsten Angriff vollständig aus. Gegen Flächenangriffe wirkt es nicht. |
| **Technique** | 1 bis 4 | Fähigkeiten aus den Pfaden |
| **Sing** | je nach Lied | Siehe Abschnitt 3 |
| **Item** | 1 | Trank, Wurfgegenstand, Öl |
| **Beistand** | 0 | Ein Begleiter oder Söldner hilft, einmal pro Kampf |
| **Withdraw** | 2 | Flucht mit einer Chance, die von der Finesse abhängt. Gegen Bosse nicht möglich. |

### 2.3 Gegnerabsichten
| Symbol | Bedeutung | Beste Antwort |
|---|---|---|
| ⚔ + Zahl | Angriff mit diesem Schaden | Guard oder Evade |
| ⚔⚔ (glühend) | Schwerer Angriff wird aufgeladen | Evade, oder **vorher unterbrechen** (Heavy Strike, Shield Bash) |
| 🛡 | Verteidigt sich | Breath sammeln, Lied beginnen |
| ♪ + Runden | Singt ein Lied | Unterbrechen |
| ✦ | Besonderes (Fluch, Beschwörung) | Je nach Gegner |
| ? | Unbekannt (Harrowing, besondere Gegner) | Raten |

**Unterbrechen ist die zentrale Taktik.** Ein unterbrochener Gegner verliert seinen Zug und ist eine Runde **„Exposed“**: Er erleidet dann +30 % Schaden. *(Poise und Stagger sind gestrichen, Entscheidung G1.)*

### 2.4 Schaden
```
Schaden = Waffenwert × (1 + Might × 0,08) × Zufall(0,9 bis 1,1)
          × Krit (×1,5) × Exposed (×1,3) − Rüstung
Mindestens 1 Schaden.
```

### 2.5 Tod, Neustart, Gegner
- Nach einem Tod beginnst du am letzten Rastplatz (Lagerfeuer, Glockenturm oder Gasthaus) und verlierst nichts.
- **Gegner kehren nur in Dungeons und im Hush zurück**, und zwar nach dem Rasten. In der offenen Welt bleiben besiegte Gegner weg. **Die Welt wird durch dich sicherer.** Neue Gegner entstehen nur durch Ereignisse der Geschichte (Entscheidung G3).
- Bosse kehren nie zurück.

### 2.6 Schwierigkeitsgrade
| | Story | Balanced | Harrowing |
|---|---|---|---|
| Gegnerschaden | ×0,6 | ×1,0 | ×1,3 |
| Gegner-HP | ×0,8 | ×1,0 | ×1,2 |
| Absichten | immer sichtbar | sichtbar | manchmal „?“ |

### 2.7 Beispielkampf
> Hinterhalt auf einen **Faded Miner** (HP 30).
> **Zug 1:** Heavy Strike (Breath 6 → 3), Krit, 14 Schaden.
> **Gegner:** Absicht ⚔⚔ „Pick Swing“ (12 Schaden, wird aufgeladen).
> **Zug 2:** Breath 5. Heavy Strike **unterbricht** die Aufladung. Der Gegner verliert seinen Zug und ist Exposed. 9 Schaden.
> **Zug 3:** Breath 4. Strike mit ×1,3 Exposed, und er fällt.

## 3. Gesangsmagie: feste Lieder

Lieder sind **vollständige alte Lieder oder Liedfragmente**, die du in der Welt findest. Jedes hat eine feste Wirkung *(Entscheidung G2)*.

- Du kannst **bis zu 4 Lieder** einstudieren, auf Song-Rang 6 sind es 5. Gewechselt wird an Rastplätzen.
- Manche Lieder brauchen **mehrere Runden Gesang** und sind dafür besonders stark. Während du singst, erleidest du +25 % Schaden. Ein schwerer Treffer **bricht das Lied ab**, und die halbe Breath kommt zurück.
- Stärke: Grundwert × (1 + Voice × 0,08)
- **Gesang macht Lärm.** Wachen reagieren darauf, in Kesh Deep ist er verboten. Lieder mit 🤫 sind leise.

### 3.1 Liederliste (Startumfang: 16 Lieder)
| Lied | Breath | Runden | Wirkung | Fundort (Beispiel) |
|---|---|---|---|---|
| *Ember Hymn* | 2 | 0 | Feuerschaden, Brennen 2 Runden | Hollowmere, Kapelle |
| *Hearthsong* 🤫 | 2 | 0 | Heilt 30 % HP | Odile (Prolog) |
| *Lantern Carol* | 2 | 0 | Starker Lichtschaden gegen Faded, erhellt in der Welt | Saint Ebba's |
| *Shanty of the Tide* | 3 | 0 | Stößt einen Gegner zurück und unterbricht | Ribcoast |
| *Thorn Lament* | 2 | 0 | Blutung 3 Runden | Thornchoir |
| *Oath Chant* | 3 | 0 | Schild, fängt 25 Schaden ab | Oathspire |
| *Lullaby of Kesh* 🤫 | 3 | 1 | Ein Gegner schläft 2 Runden | Kesh Deep |
| *Cradle Hush* 🤫 | 2 | 0 | Ein Gegner kann 2 Runden nicht singen oder zaubern | Kirche (gestohlen) |
| *Reveler's Reel* | 3 | 0 | Dein nächster Zug kostet 0 Breath | Lanternfall |
| *Dirge of Ashes* | 4 | 1 | Feuerschaden an **allen** Gegnern | Thornchoir-Tempel |
| *Song of the Low Tide* | 2 | 0 | +2 Breath, Kontrolle über Wasser in der Welt | Hollis |
| *Frostbound Hymn* | 3 | 1 | Einfrieren: Ein Gegner verliert 1 Zug | Oathspire |
| *Echo Canon* | 3 | 0 | Wiederholt dein letztes Lied zu 60 % | Orrin |
| *Requiem for the Nameless* | 4 | 2 | Sehr hoher Schaden, doppelt gegen Faded | Greywaste |
| *Ballad of Saint Ebba* 🤫 | 3 | 1 | Heilt voll und entfernt Flüche | Questbelohnung |
| *Vesper* | 5 | 2 | Alle Gegner verlieren 1 Zug, du heilst 20 % | Noonspire |

### 3.2 Die neun Lieder des Threnod
Es sind 9 besondere, sehr starke Lieder aus der Hauptgeschichte. **Jeder Gebrauch lockt Ennith an:** Der Hush breitet sich in der Nähe aus, und Unremembered erscheinen. Wie oft du sie nutzt, beeinflusst die Geschichte.

## 4. Fortschritt: die fünf Pfade

- **Insight** (Erfahrung) kommt aus Kämpfen (wenig), Quests (mittel) und **Entdeckungen (viel)**.
- Jeder Rang ist ein Punkt, den du frei auf einen Pfad verteilst. Jeder Pfad hat die Ränge 1 bis 10, und bis zum Spielende sind es ungefähr 30 Ränge.

| Pfad | Werte pro Rang | Beispiel-Passiv (Rang 5) |
|---|---|---|
| **Blade** | Might +1, Vigor +0,5 | Strike gegen Exposed kostet 0 Breath |
| **Bulwark** | Vigor +1, Resolve +0,5 | Guard gibt +2 statt +1 Breath |
| **Shadow** | Finesse +1 | Hinterhalt-Krits machen ×2,0 Schaden |
| **Song** | Voice +1 | Lieder kosten −1 Breath (mindestens 1). Auf Rang 6 ein Liedplatz mehr. |
| **Faith** | Resolve +1 | Heilung wirkt auch auf Flüche |

### Techniken (*Found, not given*)
Techniken gibt es bei Lehrern, in Büchern und an Gräbern. Sie setzen einen Mindestrang voraus.

| Pfad | Technik | Breath | Wirkung |
|---|---|---|---|
| Blade | *Riposte* | 1 | Nach einem Guard ein Gegenangriff mit 150 % |
| Blade | *Execution* | 3 | ×2,5 gegen Gegner unter 30 % HP oder Exposed |
| Bulwark | *Shield Bash* | 2 | Unterbricht, der Gegner ist Exposed |
| Bulwark | *Stand Fast* | 2 | 2 Runden unaufhaltbar, deine Lieder können nicht unterbrochen werden |
| Shadow | *Poisoned Edge* | 1 | Gift 3 Runden |
| Shadow | *Vanish* | 3 | Der nächste Angriff ist ein Hinterhalt-Krit, oder du fliehst sicher |
| Faith | *Rite of Names* | 2 | Heilt und entfernt Faded-Flüche |
| Faith | *Last Rites* | 2 | Erlöst einen Faded unter 20 % HP und gibt +Remembrance |

Außerhalb des Kampfes: Shadow schaltet Schleichen, Schlösser und Taschendiebstahl frei. Faith erlaubt das Segnen von Gräbern.

## 5. Ausrüstung

| Platz | Optionen |
|---|---|
| **Waffe** | Schwert (ausgewogen) · Streitkolben (Heavy Strike unterbricht auch Lieder mit 2 Runden) · Dolch (Krit) · Speer (handelt zuerst) · Zweihänder (×1,4 Schaden, Heavy kostet 4) |
| **Nebenhand** | **Schild** (Guard −65 %) · **Instrument** (Laute: Heil-Lieder +20 % · Handglocke: Unterbrechen +1 Runde Exposed · Horn: Schadenslieder +20 %) · **Laterne** (+30 % gegen Faded, erhellt Dunkelheit) |
| **Rüstung** | Leicht (Evade kostet 1) · Mittel · Schwer (Rüstung +50 %, nur +1 Breath pro Zug außer bei Guard) |
| **Talismane** | 2 Plätze |

## 6. Steuerung auf dem iPad
- **Touch:** links ein virtueller Stick, rechts Wischen für die Kamera, Antippen zum Interagieren. Im Kampf gibt es große Aktionsknöpfe, das Ziel wählst du durch Antippen.
- **Controller** und **Tastatur** werden ebenfalls unterstützt.
- Kämpfe lassen sich mit einer Hand spielen.
