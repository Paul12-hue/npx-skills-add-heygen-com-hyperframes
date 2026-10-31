# THRENOD · Phase 4, Teil 1: Kernsysteme

**Status:** 📝 Entwurf, wartet auf Freigabe
Alle Zahlen sind **Startwerte für das Balancing**. Sie werden beim Spieltesten angepasst.

---

## 1. Werte der Spielfigur

Es gibt keine klassischen Attribute zum Verteilen. **Die Werte ergeben sich aus den Rängen der fünf Pfade.**

| Wert | Wirkung | Steigt durch |
|---|---|---|
| **Vigor** | Lebenspunkte: `HP = 40 + 8 × Vigor` | Bulwark, Blade |
| **Might** | Schaden mit Nahkampfwaffen | Blade |
| **Finesse** | Krit-Chance, Initiative, Fliehen, Schleichen, Schlösser | Shadow |
| **Voice** | Stärke der Lieder, maximale Liedlänge | Song |
| **Resolve** | Widerstand gegen Flüche und Furcht, Heilwirkung | Faith, Bulwark |

## 2. Kampfsystem: nahtlose rundenbasierte Duelle

### 2.1 Kampfbeginn
- Gegner sind in der Welt sichtbar. Wenn du sie berührst oder sie dich bemerken, **friert die Szene ein**, und der Kampf läuft an diesem Ort ab. Die Kamera wechselt in eine leicht erhöhte Duell-Ansicht.
- **Hinterhalt** (du schleichst dich an und greifst an): Du hast den ersten Zug, deine Breath ist voll, und der erste Treffer ist ein garantierter Krit.
- **Überrascht** (ein Gegner entdeckt dich zuerst): Der Gegner hat den ersten Zug, und du beginnst mit halber Breath.
- Gegnerzahl: Du kämpfst gegen **1 bis 3 Gegner**, Bosse eventuell mit Dienern.

### 2.2 Der Zug
- **Jeder Zug besteht aus genau einer Hauptaktion.** Diese Aktion kostet **Breath** (Atem).
- **Breath:** Maximal 6. Zu Beginn jedes eigenen Zuges kommen +2 dazu.
- Reihenfolge: Du und die Gegner wechselt euch ab. Wer zuerst handelt, bestimmen Hinterhalt und Finesse.

| Aktion | Breath | Wirkung |
|---|---|---|
| **Strike** (leichter Schlag) | 1 | Normaler Schaden, kleiner Poise-Schaden |
| **Heavy Strike** | 3 | 180 % Schaden, großer Poise-Schaden, **unterbricht** gegnerische Lieder und Aufladungen |
| **Guard** | 0 | Halbiert den Schaden bis zum nächsten Zug, **+1 Breath extra** |
| **Evade** | 2 | Weicht dem nächsten Angriff **vollständig** aus. Gegen Flächenangriffe wirkt es nicht. |
| **Technique** | 1 bis 4 | Besondere Fähigkeiten aus den Pfaden |
| **Sing** | je nach Lied | Siehe Abschnitt 3 |
| **Item** | 1 | Trank, Wurfgegenstand, Öl |
| **Beistand** | 0 | Ein Begleiter oder Söldner hilft, **einmal pro Kampf** |
| **Withdraw** | 2 | Flucht mit einer Chance, die von der Finesse abhängt. Gegen Bosse nicht möglich. |

### 2.3 Gegnerabsichten
Über jedem Gegner steht ein Symbol mit dem, **was er als Nächstes tun wird**:

| Symbol | Bedeutung | Beste Antwort |
|---|---|---|
| ⚔ + Zahl | Angriff mit diesem Schaden | Guard oder Evade |
| ⚔⚔ (glühend) | Schwerer Angriff, wird aufgeladen | **Evade** oder vorher mit Heavy Strike unterbrechen |
| 🛡 | Verteidigt sich | Breath sammeln oder Lied beginnen |
| ♪ + Runden | Singt ein Lied | **Unterbrechen** |
| ✦ | Besonderes, zum Beispiel ein Fluch oder Beschwörung | Je nach Gegner |
| ? | Unbekannt (nur auf Harrowing oder bei besonderen Gegnern) | Raten |

### 2.4 Poise und Stagger
- Jeder Gegner hat **Poise** (Standfestigkeit), sichtbar als Balken unter den HP.
- Heavy Strikes, Schildstöße und manche Verse senken die Poise.
- Bei **0 Poise ist der Gegner „Staggered“**: Er verliert seinen nächsten Zug und erleidet **+50 % Schaden**. Danach füllt sich die Poise wieder.
- Darin liegt die zentrale Taktik: **Breath sparen, Poise brechen und dann zuschlagen.**

### 2.5 Schaden (Grundformel)
```
Schaden = Waffenwert × (1 + Might × 0,08) × Zufall(0,9 bis 1,1)
          × Krit (×1,5) × Staggered (×1,5) − Rüstung des Ziels
Mindestens 1 Schaden.
```

### 2.6 Tod und Neustart
- Nach einem Tod beginnst du **am letzten Rastplatz** (Lagerfeuer, Glockenturm oder Gasthaus). Du verlierst nichts.
- Normale Gegner kehren nach **3 Spieltagen** zurück, Bosse nie.

### 2.7 Schwierigkeitsgrade
| | Story | Balanced | Harrowing |
|---|---|---|---|
| Gegnerschaden | ×0,6 | ×1,0 | ×1,3 |
| Gegner-HP | ×0,8 | ×1,0 | ×1,2 |
| Absichten | immer sichtbar | sichtbar | manchmal „?“ |
| Fliehen | immer möglich | über Finesse | über Finesse, −20 % |

### 2.8 Beispielkampf
> Die Unsung schleicht sich an einen **Faded Miner** heran (HP 30, Poise 4) → **Hinterhalt**.
> **Zug 1:** Heavy Strike (Breath 6 → 3), Krit, 14 Schaden, Poise 4 → 1.
> **Gegner:** Absicht ⚔⚔ „Pick Swing“ (12 Schaden, wird aufgeladen).
> **Zug 2:** Breath 3 + 2 = 5. **Evade** (→ 3). Der Spitzhackenhieb geht ins Leere.
> **Zug 3:** Breath 5. Strike (→ 4), Poise 1 → 0, **Staggered**.
> **Zug 4:** Breath 6. Heavy Strike auf den Staggered-Gegner ×1,5, und er fällt.

## 3. Gesangsmagie

### 3.1 Verse
Verse findest du in der Welt: in Gräbern, Ruinen, Büchern, bei Lehrern und bei sterbenden Wesen. Es gibt drei Arten:

| Art | Aufgabe | Beispiele |
|---|---|---|
| **Root** (Grundvers) | Bestimmt die Wirkung | *Ember* (Feuerschaden) · *Hearth* (Heilung) · *Thorn* (Blutung) · *Tide* (Poise-Schaden, Wegstoßen) · *Lantern* (Licht, stark gegen Faded) · *Oath* (Schild) · *Hush* (verstummen lassen) |
| **Turn** (Wendung) | Verändert die Wirkung | *Again* (zweimal auslösen) · *Wide* (alle Gegner) · *Long* (Dauer +2) · *Soft* (leise, lockt keine Wachen an) |
| **Close** (Schluss) | Verstärkt oder fügt etwas hinzu | *Requiem* (+Schaden gegen Verletzte) · *Lullaby* (Gegner schläft) · *Cadence* (gibt Breath zurück) |

### 3.2 Lieder
- Ein Lied besteht aus **2 bis 4 Versen**, und zwar genau einem Root plus beliebigen Turns und Closes.
- Du kannst **bis zu 4 Lieder** fest „einstudieren“. Das geht an jedem Rastplatz.
- **Dauer:** Ein Lied mit 2 Versen wirkt sofort. 3 Verse brauchen 1 Runde Gesang, 4 Verse brauchen 2 Runden.
- **Stärke:** ×1,0 bei 2 Versen, ×1,6 bei 3 Versen, ×2,4 bei 4 Versen, jeweils zusätzlich × (1 + Voice × 0,08).
- **Kosten:** 1 Breath pro Vers. Sie werden beim Beginn des Liedes bezahlt.
- **Unterbrechung:** Während du singst, erleidest du +25 % Schaden. Ein **schwerer Treffer bricht das Lied ab**, und die halbe Breath kommt zurück.
- Die maximale Liedlänge hängt am Pfad Song: Rang 1 erlaubt 2 Verse, Rang 4 erlaubt 3 und Rang 8 erlaubt 4.

### 3.3 Gesang in der Welt
- **Gesang macht Lärm.** Wachen der Kirche reagieren darauf, und in Kesh Deep ist er ein Verbrechen.
  Mit dem Turn *Soft* bleibst du leise, die Wirkung ist dann aber schwächer.
- Manche Lieder wirken auch außerhalb des Kampfes: *Lantern* erhellt Höhlen, *Tide* bewegt Wasser oder Hindernisse, *Hearth* entzündet Feuer.

### 3.4 Die Verse des Threnod
- Es sind **9 besondere Verse**, die du über die Hauptgeschichte erhältst. Sie sind sehr stark.
- **Jeder Gebrauch lenkt Enniths Aufmerksamkeit auf dich.** In der Nähe breitet sich der Hush aus, und Unremembered tauchen auf. Wie oft du sie nutzt, beeinflusst die Geschichte und die Enden.

## 4. Fortschritt: die fünf Pfade

### 4.1 Erfahrung
Es gibt drei Quellen für **Insight** (Erfahrung):
- **Kämpfe** geben wenig
- **Quests** geben mittel
- **Entdeckungen** geben viel: neue Orte, Glockentürme, Bücher, Legenden

Erkundung soll sich mehr lohnen als stures Kämpfen.

Insight wird automatisch zu **Rängen**. Jeder Rang ist ein Punkt, den du **frei auf einen Pfad** verteilst.

### 4.2 Die Pfade
Jeder Pfad hat die Ränge 1 bis 10. Bis zum Ende des Spiels erreicht man **ungefähr 30 Ränge**. Man kann also nicht alles meistern und hat dadurch eine klare Rolle.

| Pfad | Werte pro Rang | Beispiel-Passiv |
|---|---|---|
| **Blade** | Might +1, Vigor +0,5 | Rang 5: Strike kostet 0 Breath, wenn der Gegner Staggered ist |
| **Bulwark** | Vigor +1, Resolve +0,5 | Rang 5: Guard gibt +2 statt +1 Breath |
| **Shadow** | Finesse +1 | Rang 5: Hinterhalt-Krits machen ×2,0 statt ×1,5 Schaden |
| **Song** | Voice +1 | Siehe maximale Liedlänge, dazu ein Liedplatz mehr auf Rang 6 |
| **Faith** | Resolve +1 | Rang 5: Heilung wirkt auch auf Flüche |

### 4.3 Techniken (*Found, not given*)
Techniken gibt es **nicht** über Ränge. Du findest sie bei **Lehrern, in Büchern und an Gräbern**. Sie setzen einen Mindestrang voraus.

| Pfad | Technik | Breath | Wirkung |
|---|---|---|---|
| Blade | *Riposte* | 1 | Nach einem Guard ein Gegenangriff mit 150 % |
| Blade | *Execution* | 3 | ×2,5 gegen Staggered |
| Bulwark | *Shield Bash* | 2 | Großer Poise-Schaden, unterbricht |
| Bulwark | *Stand Fast* | 2 | 2 Runden unaufhaltbar, Lieder können nicht unterbrochen werden |
| Shadow | *Poisoned Edge* | 1 | Gift, 3 Runden lang |
| Shadow | *Vanish* | 3 | Der Gegner verliert dich aus den Augen. Danach ist der nächste Angriff ein Hinterhalt-Krit, oder du fliehst sicher. |
| Faith | *Rite of Names* | 2 | Heilt und entfernt Faded-Flüche |
| Faith | *Last Rites* | 2 | Ein Faded mit weniger als 20 % HP wird **erlöst** statt getötet und gibt **+Remembrance** |

**Außerhalb des Kampfes:** Shadow schaltet Schleichen, Schlösserknacken und Taschendiebstahl frei. Faith erlaubt das Segnen an Gräbern.

## 5. Ausrüstung (Grundlagen)

| Platz | Optionen |
|---|---|
| **Waffe** | Schwert (ausgewogen) · Streitkolben (hoher Poise-Schaden) · Dolch (Krit, Shadow) · Speer (handelt zuerst) · Zweihänder (×1,4 Schaden, Heavy kostet 4) |
| **Nebenhand** | **Schild** (Guard reduziert 65 % statt 50 %) **oder Instrument** (Laute: Heil-Lieder +20 %, Handglocke: Lieder unterbrechen leichter, Horn: Schadenslieder +20 %) **oder Laterne** (+30 % gegen Faded, erhellt Dunkelheit) |
| **Rüstung** | Leicht (Evade kostet 1) · Mittel · Schwer (Rüstung +50 %, aber nur +1 Breath pro Zug außer bei Guard) |
| **Talisman** | Zwei Plätze für besondere Effekte, zum Beispiel *„Tilde's Lost Word“* |

Es gibt kein Gewichtslimit (Phase 1). Die Rüstungsklasse hat nur Auswirkungen im Kampf.

## 6. Steuerung auf dem iPad

| | Erkunden | Kampf |
|---|---|---|
| Touch | Linker Daumen: virtueller Stick · rechts wischen: Kamera · antippen: interagieren | Große Aktionsknöpfe unten, Ziel durch Antippen des Gegners wählen |
| Controller | Klassisch | Steuerkreuz und Tasten durch die Menüs |
| Tastatur | WASD und Maus | Zifferntasten 1 bis 9 |

Kämpfe sind auf **eine Hand** ausgelegt. Man kann also auch auf dem Sofa spielen.
