# Plan: Ausdauer- und Triathlon-Modul

Status: nur Recherche und Plan, nichts umgesetzt. Grundlage: Triathlon-Trainingsplan Sprintdistanz (Beginner, 16 Wochen, PDF), Recherche zu Runna, TrainingPeaks-Metriken und Periodisierung.

Achtung Scope: CLAUDE.md sagt "Scope is closed after Phase 8". Dieses Modul öffnet ihn bewusst. Vor Start von E0 CLAUDE.md anpassen (Abschnitt Ausdauer). Weiterhin gilt: kein Backend, kein Sync, Export/Import muss alles enthalten, Statistiken aus Sätzen berechnen, Timer mit Zeitstempeln, UI deutsch, Code englisch.

## 1. Was das PDF zeigt (Struktur, die wir abbilden müssen)

- 16 Wochen, Phasen: Grundlage 1-3 (9 Wochen), Aufbau 1-2 (4), wettkampfspezifisch (3, hier "Höchstleistung", dann Wettkampfwoche). Jede 3. Woche Ruhewoche (Umfang ca. -20 %).
- Pro Woche 6-8 Einheiten an festen Wochentagen: Schwimmen 2x, Rad 2x, Laufen 2x, Stabi 1x (Mobility/Core, später Kraft/Core), ab Woche 7 Koppellauf nach dem Rad.
- Einheitentypen: Grundlage, Regeneration, Intervalle, Koppellauf, Stabi, Wettkampf (Priorität A).
- Ziel pro Einheit: Dauer (Rad/Lauf), bei Schwimmen strukturierte Sätze ("8 x 100 m Pullbuoy, ruhiges Tempo"), bei Intervallen "4 x 5 min hohes, kontrolliertes Tempo", "3 x 1000 m etwas schneller als 5k-Wettkampftempo".
- Wochensummen je Sportart (5:15 h bis 7:40 h, Wettkampfwoche 2:10 h).
- Leistungsdaten (Rad-FTP, Lauf-FTP) optional, im Plan "keine Angabe". Heißt: Plan muss ohne Wattmesser und Pulsuhr nutzbar sein (nach Gefühl/RPE und Zonen).
- Hinweis zum Urheberrecht: Das PDF ist von triathlon-trainingspläne.de. Wir übernehmen nur die Struktur (Phasen, Rhythmus, Einheitentypen) und bauen einen eigenen Generator. Keine Texte oder kompletten Wochen 1:1 ins (öffentliche) Repo kopieren.

## 2. Recherche-Ergebnisse (was wir übernehmen)

**Runna** (Ziele -> Plan):
- Eingaben: Zielrennen und Datum, aktuelles Niveau (eine geschätzte Rennzeit), Lauftage pro Woche, Umfang/Schwierigkeit. Plan startet bis zu 26 Wochen vor dem Rennen.
- Alle Tempovorgaben kommen aus EINER Referenzzeit und gelten für alle Distanzen. Plan trainiert nicht auf eine Zielzeit hin, höhere Referenzzeit = härtere Paces.
- Anpassung: nur bei wiederholtem Verfehlen/Übertreffen der Tempovorgaben (Muster, nicht Einzelwert, Ausreißer ignorieren). Verpasste Einheiten oder verschobenes Rennen -> Plan wird neu verteilt. "Nicht 100 %"-Modus bei Krankheit/Verletzung.
- Nur Tempo, keine Herzfrequenz. Plus Kraft und Mobility im Plan.
-> Wir übernehmen: Zielrennen+Datum, Referenzzeit -> Paces, Verfügbarkeit, Rückwärtsplanung, Regel-basierte Anpassung, Krankheitsmodus. Kein KI/Server nötig, alles deterministisch und testbar.

**Periodisierung** (Triathlete, Active): Grundlage -> Aufbau -> Spitze -> Tapering, Ruhewochen, Koppeleinheiten früh einführen, Anfänger Sprint ca. 5-8 h/Woche, 12-20 Wochen.

**Tempo-Berechnung**: Riegel (Exponent 1,06) für Rennzeit-Prognose, gut innerhalb etwa halber bis doppelter Distanz. VDOT (Daniels) für Trainingspaces (leicht, Marathon, Schwelle, Intervall, Wiederholung). Beides sind Schätzungen. Wir nehmen VDOT für Paces und Riegel nur als grobe Prognose, beides mit Hinweis "Schätzung".

**Belastungs-Dashboard** (TrainingPeaks-Logik): TSS pro Einheit, CTL (Fitness, 42-Tage-Mittel), ATL (Ermüdung, 7 Tage), TSB = CTL - ATL (Form, vor dem Rennen grob +5 bis +25). Quellen streuen bei den Zahlen, daher nur als Orientierung. Ohne Watt/Puls: vereinfachte Belastung = Dauer x Intensitätsfaktor (aus Zone bzw. RPE), nennen wir "Belastungspunkte", nicht TSS. Grenze: CTL sagt nichts über Intensitätsverteilung, deshalb zusätzlich Zonenverteilung (ca. 80 % leicht).

Quellen: [Runna Adaptation](https://the5krunner.com/2026/09/28/is-runna-ai/), [Runna Rennkalender](https://www.techradar.com/health-fitness/fitness-apps/strava-owned-runna-just-launched-the-feature-ive-been-waiting-for-to-plan-my-race-calendar), [CTL/ATL/TSB](https://trainerplan.co/blog/chronic-training-load-ctl-explained/), [PMC](https://support.myprocoach.net/hc/en-us/articles/360040589772), [Triathlon-Periodisierung](https://www.triathlete.com/training/how-to-use-periodization-in-your-triathlon-training-plan/?scope=anon), [Riegel/VDOT](https://runnersconnect.net/race-calculators/).

## 3. Entscheidungen (Vorschlag, bitte bestätigen)

1. **Einheiten als normale Workouts speichern.** Ausdauer-Einheit = `Workout` mit Übungen Schwimmen/Rad/Laufen/Stabi (Typ `distance_duration` gibt es schon). Intervalle = Sätze (z. B. 8 x 100 m). Vorteil: Verlauf, Backup, Strong-Import, Rekorde, aktive Einheit funktionieren sofort. Neu nur optionale Felder: `sport`, `plannedSessionId`, pro Satz `zone` (1-5) und `avgHr`.
2. **Neue Tabellen nur für die Planung:** `goals`, `plans` (inkl. Wochen/geplante Einheiten). Ist-Daten bleiben in `workouts`, nie doppelt gespeichert.
3. **Plan-Generator regelbasiert, in reinem TypeScript** (testbar, offline). Kein KI-Aufruf.
4. **Kein GPS-Tracking im Browser** (iOS-PWA läuft im Hintergrund nicht zuverlässig, Hintergrund-GPS fehlt). Eingabe manuell oder per Datei-Import (GPX/TCX/FIT aus Garmin/Strava/Apple-Export), Import erst spät und optional.
5. **Zonen nach Gefühl (RPE) als Standard**, Puls und Watt optional nachrüstbar.
6. Marathon/Halbmarathon/10k als Laufpläne, Sprint/Olympisch als Triathlon. Mit Sprint zuerst bauen (Vorlage vorhanden), andere Distanzen sind nur Parameter.

## 4. Datenmodell (Skizze)

```
Workout (erweitert)   sport?: 'swim'|'bike'|'run'|'strength'|'brick'; plannedSessionId?: string
WorkoutSet (erweitert) zone?: 1-5; avgHr?: number          (distanceM, durationSec, rpe gibt es schon)
Exercise              neue Seed-Übungen: Laufen (Lauf), Radfahren, Schwimmen (Kraul), Koppellauf, Mobility/Core
Goal                  id, type ('sprint'|'olympic'|'70.3'|'ironman'|'5k'|'10k'|'half'|'marathon'),
                      raceDate, referenceTime {distanceM, timeSec}, targetTimeSec?, priority 'A'|'B'|'C'
Plan                  id, goalId, startDate, level, daysPerWeek/availability{weekday: sports[]}, hoursPerWeek,
                      weeks[]: { index, phase, isRecovery, sessions: PlannedSession[] }
PlannedSession        id, date, sport, kind ('base'|'recovery'|'intervals'|'brick'|'strength'|'race'),
                      targetDurationSec?, targetDistanceM?, zone?, steps?: [{repeat, distanceM|durationSec, intensity, note}],
                      status derived: done (verknüpftes Workout) | skipped | open
Profile (erweitert)   paceZones?, ftpW?, thresholdHr? (alle optional)
Backup                Version 3: goals, plans mit aufnehmen, v1/v2 weiter importierbar
```

## 5. Dashboards im Ausdauer-Bereich

Neuer Hauptbereich "Ausdauer" (Navigation Telefon + Seitenleiste). Reiter: Heute, Plan, Auswertung, Ziele.

1. **Heute**: nächste geplante Einheit mit Schritten, "Starten" übernimmt sie in die aktive Einheit; Rennen-Countdown, aktuelle Phase, Wochenfortschritt (Soll/Ist je Sportart).
2. **Plan/Kalender**: Wochenansicht und Gesamtansicht (16 Wochen als Balken pro Phase), Einheiten verschieben/überspringen, Ruhewochen markiert.
3. **Wochenumfang**: gestapelte Balken (Schwimmen/Rad/Lauf/Stabi) in Stunden und km, mit Plan-Linie.
4. **Plan-Erfüllung**: Prozent erledigt pro Woche und Sportart.
5. **Intensitätsverteilung**: Anteil Zone 1-2 vs. 3-5 (80/20-Check).
6. **Belastung**: Belastungspunkte pro Tag, Fitness/Ermüdung/Form-Kurve (CTL/ATL/TSB), Form am Renntag als Prognose.
7. **Fortschritt**: Pace-Entwicklung bei gleicher Anstrengung (Lauf min/km, Schwimmen min/100 m, Rad km/h), längster Lauf/Rad/Schwimmzug, Bestzeiten (schnellste 5k/10k, 400 m/1500 m Schwimmen).
8. **Rennprognose**: Riegel/VDOT aus bester aktueller Leistung, Verlauf der Prognose, Abstand zur Zielzeit.
9. **Ziel-Check** (wie Runna): "Mit deinem Stand schaffst du X, Ziel ist Y, dafür sind Z Wochen mit N h nötig".
Alle Diagramme mit Recharts (lazy), Skill `dataviz` vor dem Bauen laden. Prüfen bei 390 px und Desktop.

## 6. Umsetzungsphasen mit Modellempfehlung

Konvention nach Efficiency.md: Standard Sonnet, Opus nur für Entwurf/Logik mit hohem Fehlerrisiko, Opus plant, Sonnet setzt um. Vor jeder Phase Modellwechsel-Stopp wie in CLAUDE.md. **Nach jeder Phase: Push, dann `/clear`.** Mitten in langen Phasen (E3, E4, E6) nach dem Kern `/compact` mit Hinweis "Datenmodell, Entscheidungen aus ENDURANCE-PLAN.md, offene Tests behalten".

| Phase | Inhalt | Modell | Danach |
|---|---|---|---|
| E0 | Entscheidungen bestätigen, CLAUDE.md-Scope anpassen, Datenmodell + Dexie-Migration + Backup v3 festlegen (nur Typen, Migration, Tests) | **Opus** (Architektur) | `/clear` |
| E1 | Ausdauer-Übungen im Seed (Lauf/Rad/Schwimmen/Koppel/Mobility), Einheiten-Logging: Distanz/Zeit/Zone/RPE, Pace-Anzeige (min/km, min/100 m, km/h), Verlauf-Darstellung | Sonnet | `/clear` |
| E2 | Intervall-Vorlagen: Blöcke mit Wiederholungen ("8 x 100 m"), Warm-up/Cool-down, Schwimmsätze, Koppel-Vorlage; Vorlagen-Editor erweitern | Sonnet | `/clear` |
| E3 | Ziele (Rennen, Datum, Referenzzeit, Priorität) + Plan-Speicherung + Kalender/Wochenansicht, Einheit starten aus Plan, Verknüpfung Soll/Ist | Sonnet (Kalender-UI), Datenlogik zuerst mit Tests | `/compact` nach Datenlogik, dann `/clear` |
| E4 | **Plan-Generator**: Rückwärtsplanung vom Renntermin, Phasen, Ruhewoche alle 3 Wochen, Umfangssteigerung max ca. 10 %/Woche, Verfügbarkeit pro Wochentag, Koppeleinheiten, Taper; Presets Sprint (zuerst), Olympisch, 10k/Halb/Marathon | **Opus** (Regeldesign + Tests), Umsetzung Sonnet | `/compact` nach Regeln, `/clear` am Ende |
| E5 | Tempo-/Zonenrechner: VDOT-Paces, Riegel-Prognose, RPE-Zonen, optional FTP/Schwellenpuls; Profil-Einstellungen | Sonnet (Formeln mit Tests) | `/clear` |
| E6 | Dashboards 1-5 (Heute, Wochenumfang, Erfüllung, Intensitätsverteilung, Kalenderübersicht) | Sonnet | `/clear` |
| E7 | Dashboards 6-9 (Belastung CTL/ATL/TSB, Fortschritt, Rennprognose, Ziel-Check) | Sonnet; Belastungsmodell-Entwurf Opus | `/clear` |
| E8 | Anpassung (Runna-Stil): verpasste Einheiten neu verteilen, Pace-Muster erkennen und Referenzzeit vorschlagen, Krankheitsmodus, Rennen verschieben | **Opus** | `/clear` |
| E9 | Optional: GPX/TCX-Import (FIT später), Strong-Import-Muster wiederverwenden | Sonnet | `/clear` |
| E10 | Abschluss: Offline/PWA-Check, Backup-Vollständigkeit, Responsive-Check 390 px/Desktop/2xl, README + CLAUDE.md aktualisieren | Sonnet | Ende |

Reihenfolge nach Nutzen: E0-E2 bringen schon Tracking und Vorlagen. E3-E4 liefern den Plan. E6-E7 die Dashboards. E8-E10 optional nachziehen.

## 7. Risiken und offene Punkte

- **Datenmodell-Migration** (Dexie-Version, Backup v3) ist das größte Risiko, deshalb E0 mit Opus und Tests. Alte Backups müssen importierbar bleiben.
- **Pace-Genauigkeit ohne GPS**: Distanz muss manuell eingegeben werden, Pace ist nur so gut wie die Eingabe. Bei Schwimmen unkritisch (Bahnen), beim Laufen/Rad mäßig.
- **Belastungsmodell ohne Watt/Puls** ist grob (RPE-basiert). Klar als Schätzung beschriften.
- **Plan-Qualität**: Generator ist eine Orientierung, kein individueller Trainer. Gesundheitshinweis wie im PDF anzeigen.
- **Urheberrecht** der PDF-Pläne beachten (nur Struktur).
- **Aufwand**: E3, E4, E7 sind die größten Brocken.

## 8. Freigegebene Entscheidungen (Stand Rückmeldung)

1. **Reihenfolge: erst Marathon (reiner Laufplan), dann Sprint-Triathlon.** Generator und Dashboards zuerst nur für Laufen, Triathlon-Teile (Schwimmen, Rad, Koppel, Stabi) kommen danach als eigene Phase.
2. **Puls und Watt kommen ins Modell** (optional pro Einheit/Satz, Zonen aus Schwellenpuls bzw. FTP, Zonenverteilung nach Puls). RPE bleibt als Fallback.
3. **Kein festes Rennen nötig, aber ein Zieltermin wird gesetzt.** Ziel = Typ + Zieldatum (+ optional Zielzeit). Ein konkretes Rennen kann später ergänzt werden. Das Zieldatum bestimmt Rückwärtsplanung und Phasen.
4. Offen: Tage/Stunden pro Woche werden beim Anlegen des Plans abgefragt (Generator-Eingabe), nicht vorab festgelegt.

## 9. Wearable-Anbindung (Machbarkeit)

Direkte Live-Schnittstelle ist in einer reinen Web-App (PWA auf GitHub Pages, iPhone) praktisch nicht möglich:

| Weg | Geht? | Grund |
|---|---|---|
| Apple Health / HealthKit direkt | Nein | Kein Zugriff aus dem Browser, nur native App |
| Garmin Connect / Strava API | Nein (praktisch) | Garmin: Partnerprogramm nur für Firmen. Strava: OAuth braucht geheimes Client-Secret = Server nötig (wir haben bewusst keinen Backend) |
| Bluetooth-Pulsgurt live (Web Bluetooth) | Nicht auf iPhone | Safari/iOS unterstützt es nicht, Chrome auf Android/Desktop schon. Wäre nur ein Bonus für Nicht-iOS |
| **Datei-Import (FIT/TCX/GPX)** | **Ja** | Aktivität aus Garmin Connect, Strava oder Uhr exportieren, in der App importieren. Enthält Puls, Distanz, Dauer, Runden. Parser läuft komplett im Browser |
| **Apple-Health-Export (export.zip)** | **Ja, mit Aufwand** | Enthält Workouts mit Durchschnittspuls. Große Datei, Parser im Browser/Worker nötig |
| Strava-Bulk-Export (CSV + Dateien) | Ja | Einmaliger Verlauf-Import, ähnlich dem Strong-Import |
| Manuelle Eingabe von Durchschnitts- und Maximalpuls | Ja | Immer verfügbar |

Empfehlung: E9 (Datei-Import) wird deshalb wichtiger und rückt vor die Anpassungslogik. Zuerst GPX/TCX (einfaches XML), dann FIT (Binärformat, eigene kleine Dekodierung), Apple-Health-Export optional. Bei Bedarf Web-Bluetooth-Live-Puls später als Zusatz für Android/Desktop.

## 10. Angepasste Phasenfolge (ersetzt Tabelle in Abschnitt 6 bei Konflikt)

| Phase | Inhalt | Modell |
|---|---|---|
| E0 | Entscheidungen, CLAUDE.md-Scope, Datenmodell (inkl. Puls/Watt/Zonen), Migration, Backup v3 | Opus |
| E1 | Laufen-Logging (Distanz, Zeit, Pace, Puls, Zone), Verlauf | Sonnet |
| E2 | Intervall-Vorlagen fürs Laufen (Tempo, Intervalle, Long Run) | Sonnet |
| E3 | Ziel (Typ + Zieltermin), Plan-Speicherung, Kalender, Einheit starten aus Plan | Sonnet |
| E4 | **Marathon-Plan-Generator** (Rückwärtsplanung, Long-Run-Progression, Ruhewochen, Taper) | Opus |
| E5 | Zonen/Tempo: VDOT, Riegel, Pulszonen, FTP | Sonnet |
| E6 | Lauf-Dashboards (Heute, Wochenumfang, Erfüllung, Zonen, Belastung, Fortschritt, Prognose) | Sonnet (Belastungsmodell Opus) |
| E7 | Datei-Import GPX/TCX/FIT (Puls) | Sonnet |
| E8 | Anpassungslogik (verpasste Einheiten, Pace-Muster, Krankheitsmodus) | Opus |
| T1 | Triathlon-Erweiterung: Schwimmen, Rad, Koppel, Stabi im Logging und in Vorlagen | Sonnet |
| T2 | Sprint-Triathlon-Generator (Quelle PDF-Struktur), Wochen mit 3 Sportarten | Opus |
| T3 | Triathlon-Dashboards (Umfang je Sportart, Rad-Watt/FTP, Schwimm-Pace) | Sonnet |
| E9 | Abschluss: Offline, Backup, Responsive, Doku | Sonnet |

Nach jeder Phase Push und `/clear`, mitten in E4, E6, T2 ein `/compact`.
