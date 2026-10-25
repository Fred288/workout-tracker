# Efficiency.md – Regeln für sparsamen Tokenverbrauch

Diese Datei steuert, wie du (Claude Code) mit Kontext, Modellen und Tools umgehst.
Ziel: gleiche Qualität bei möglichst wenig Tokens. Qualität und Korrektheit haben
im Zweifel Vorrang vor Einsparung.

## 1. Kontext klein halten (wichtigster Hebel)

Jeder Schritt liest den kompletten bisherigen Verlauf erneut. Ein großer Kontext
kostet deshalb bei jeder weiteren Anfrage.

- Eine Session = eine zusammenhängende Aufgabe. Wenn die Aufgabe abgeschlossen ist,
  weise mich am Ende der Antwort in EINEM kurzen Satz darauf hin, dass ein `/clear`
  sinnvoll ist, bevor wir etwas Neues beginnen.
- Wenn der Kontext spürbar groß wird oder wir mitten in einer langen Aufgabe sind,
  schlage `/compact` vor (mit einem Hinweis, was erhalten bleiben soll).
- Wenn wir nach einer längeren Pause weitermachen, schlage eine neue Session mit
  kurzer Zusammenfassung vor, statt den alten Kontext wieder aufzuwärmen.
- Du kannst `/clear` und `/compact` nicht selbst ausführen. Erinnere mich nur daran,
  aber ohne zu nerven: höchstens einmal pro Aufgabe.

## 2. Dateien und Suche

- Lies keine ganzen Dateien, wenn ein Ausschnitt reicht. Erst suchen (Grep/Glob),
  dann gezielt mit Zeilenbereich lesen.
- Lies eine Datei nicht erneut, wenn sie sich seit dem letzten Lesen nicht geändert hat.
- Keine großen Verzeichnisse, Logs oder Lockfiles komplett einlesen
  (z. B. `node_modules`, `package-lock.json`, Build-Ordner, große JSON-Dateien).
- Bei Shell-Ausgaben: Ausgabe begrenzen (`head`, `tail`, `--oneline`, `--stat`,
  `-q`), statt alles in den Kontext zu laden.
- Bei Fehlern zuerst die relevante Fehlermeldung und die betroffene Stelle
  anschauen, nicht das ganze Projekt.

## 3. Vorgehen

- Bei größeren Änderungen kurz planen und mit mir abstimmen, bevor du viel Code
  schreibst. Ein falscher Weg kostet mehr als eine Rückfrage.
- Bei unklaren Anforderungen eine gezielte Rückfrage stellen, statt zu raten
  und nachzubessern.
- Kleine, abgeschlossene Schritte. Nach jedem Schritt prüfen, nicht erst am Ende.
- Keine unnötigen Refactorings oder Zusatzfeatures, die ich nicht verlangt habe.
- Keine Wiederholung von Code oder Inhalten, die ich schon gesehen habe.
  Bei Änderungen nur den geänderten Teil zeigen.

## 4. Antworten

- Kurz und konkret. Keine Einleitungen, keine Wiederholung der Aufgabe,
  keine ausführliche Zusammenfassung dessen, was du gerade getan hast.
- Am Ende einer Aufgabe: ein bis zwei Sätze zum Ergebnis, plus ein nächster
  sinnvoller Schritt, falls es einen gibt.
- Ausführlicher nur, wenn ich ausdrücklich Erklärungen verlange oder die Sache
  sicherheits- oder datenrelevant ist.

## 5. Modellwahl

- Standard ist Sonnet. Opus nur bei schwieriger Planung, Architekturentscheidungen
  oder hartnäckigem Debugging.
- Wenn du merkst, dass eine Aufgabe einfach ist (Umbenennen, Formatieren, kleine
  Textänderungen, Boilerplate), sage mir, dass dafür ein kleineres Modell reicht.
- Wenn du Opus für eine schwere Aufgabe für nötig hältst, schlag den Wechsel vor
  (`/model`) und begründe es in einem Satz. Schalte nicht selbst um.
- Wenn möglich: Opus plant, Sonnet setzt um.

## 6. Subagenten und Tools

- Nutze Subagenten nur, wenn eine Aufgabe breit ist (viele Dateien durchsuchen)
  und nur das Ergebnis zählt. Für einfache Aufgaben ist das Overhead.
- Gib Subagenten eine knappe, vollständige Aufgabe und verlange eine kurze Antwort.
- Starte nicht mehrere Agenten für dieselbe Frage.
- Nutze bestehende Tools (context-mode, falls aktiv) für große Ausgaben,
  statt sie roh in den Kontext zu holen.

## 7. Beim Start prüfen

- Wenn der Startkontext auffällig groß wirkt, weise mich auf `/context` hin und
  nenne, was Platz belegt (MCP-Server, Plugins, lange CLAUDE.md).
- Schlage vor, ungenutzte MCP-Server und Plugins zu deaktivieren.

## 8. Grenzen dieser Regeln

- Spare nie bei Tests, Sicherheitsprüfungen oder Rückfragen zu destruktiven
  Aktionen (Löschen, Überschreiben, Push, Zugangsdaten).
- Wenn eine dieser Regeln das Ergebnis erkennbar verschlechtern würde,
  sag es kurz und frag mich.

---

## Hinweise für mich (nicht für Claude gedacht)

- Diese Datei in die `CLAUDE.md` einbinden, damit sie jede Session geladen wird:
  `@Efficiency.md` (Pfad relativ zur CLAUDE.md anpassen).
- Sie wird bei jeder Session mitgelesen und kostet selbst Tokens. Wenn sie dir zu
  lang wird, streiche, was du nicht brauchst.
- Regeln reichen nicht: Claude kann `/clear`, `/compact` und den Modellwechsel
  nicht selbst auslösen. Das bleibt deine Aufgabe.
- Wirkung messen mit `npx ccusage session` und `npx ccusage daily --breakdown`,
  vorher und nachher, mit ähnlicher Arbeit.
