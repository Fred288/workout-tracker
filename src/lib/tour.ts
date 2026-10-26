// Guided tour of the app. It only runs when the user starts it (button on the start page),
// walks through the main screens and highlights elements marked with data-tour="<target>".

export interface TourStep {
  id: string;
  route: string;
  /** Value of the data-tour attribute to highlight; without it the card is centred. */
  target?: string;
  title: string;
  text: string;
}

/** Anchors the tour may point at (set as data-tour on the elements). */
export const TOUR_TARGETS = [
  'start-workout',
  'templates',
  'presets',
  'nav-exercises',
  'nav-history',
  'nav-endurance',
  'nav-profile',
  'endurance-tabs',
] as const;

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    route: '/workout',
    title: 'Willkommen',
    text: 'Diese Tour zeigt dir die App Schritt für Schritt. Deine Daten bleiben auf diesem Gerät, es gibt kein Konto. Du kannst die Tour jederzeit beenden und über die Startseite neu starten.',
  },
  {
    id: 'start',
    route: '/workout',
    target: 'start-workout',
    title: 'Training starten',
    text: 'Hier beginnst du ein Workout. Ein leeres Workout füllst du mit Übungen aus der Bibliothek. Läuft schon eins, steht hier „Workout fortsetzen“.',
  },
  {
    id: 'templates',
    route: '/workout',
    target: 'templates',
    title: 'Vorlagen',
    text: 'Eigene Vorlagen starten ein Workout mit vorbefüllten Sätzen. Speichern kannst du sie im Verlauf oder in der Zusammenfassung nach einem Training.',
  },
  {
    id: 'presets',
    route: '/workout',
    target: 'presets',
    title: 'Ausdauer-Vorlagen',
    text: 'Fertige Einheiten für Laufen, Schwimmen, Rad, Koppeltraining und Stabi, zum Beispiel Intervalle oder ein langer Lauf. Sie lassen sich direkt starten.',
  },
  {
    id: 'during',
    route: '/workout',
    title: 'Im Training',
    text: 'Pro Satz trägst du Gewicht und Wiederholungen ein und hakst ihn ab. Die Spalte „Vorher“ zeigt das letzte Mal. Tippst du auf die Satznummer, änderst du die Art (Aufwärmen, Dropsatz) oder löschst den Satz. Übungen sortierst du über den Griff ⠿ per Ziehen. Nach „Beenden“ siehst du die Zusammenfassung mit neuen Rekorden.',
  },
  {
    id: 'timer',
    route: '/workout',
    title: 'Timer für Ausdauer',
    text: 'Bei Lauf, Schwimmen und Rad erscheint ein Timer mit Ring, Pause und „Weiter“ zum nächsten Schritt. Die Distanz trägst du pro Schritt ein, die App rechnet Pace oder km/h und zeigt die Zielpace der Zone. Die Zeit läuft auch weiter, wenn die App im Hintergrund war.',
  },
  {
    id: 'exercises',
    route: '/exercises',
    target: 'nav-exercises',
    title: 'Übungen',
    text: 'Die Bibliothek mit Anleitung, Zeichnungen und Muskel-Silhouette. Die Suche versteht auch deutsche Begriffe, Filter gibt es für Muskel und Gerät. Fehlt eine Übung, legst du sie selbst an. In jeder Übung findest du deinen Verlauf und die Rekorde.',
  },
  {
    id: 'records',
    route: '/records',
    target: 'nav-exercises',
    title: 'Rekorde',
    text: 'Im Reiter „Rekorde“ siehst du je Übung deinen Bestwert, zum Beispiel höchstes Gewicht, geschätztes Maximum oder längste Distanz.',
  },
  {
    id: 'history',
    route: '/history',
    target: 'nav-history',
    title: 'Verlauf',
    text: 'Alle beendeten Workouts nach Monat. Antippen zeigt Details. Dort kannst du Sätze nachträglich bearbeiten, das Workout wiederholen oder als Vorlage speichern.',
  },
  {
    id: 'endurance',
    route: '/endurance',
    target: 'nav-endurance',
    title: 'Ausdauer',
    text: 'Der Bereich für Ziele und Trainingspläne: Laufen (5 km bis Marathon) und Triathlon (Sprint und Olympische Distanz) mit Schwimmen, Rad, Laufen, Stabi und Koppeltraining.',
  },
  {
    id: 'endurance-tabs',
    route: '/endurance',
    target: 'endurance-tabs',
    title: 'Heute, Plan, Auswertung',
    text: '„Heute“ zeigt die nächste Einheit, die Woche und Vorschläge, falls du etwas verpasst hast oder nicht fit bist. Im „Plan“ legst du ein Ziel mit Datum an und lässt dir einen Plan erstellen, mit deinen Trainingstagen und deinem aktuellen Umfang als Startpunkt. „Auswertung“ zeigt Umfang (auch je Sportart), Intensität, Fortschritt, Rad-Leistung, Schwimm-Pace, Prognose und deine Belastung.',
  },
  {
    id: 'plan-wizard',
    route: '/endurance',
    title: 'Plan in vier Schritten',
    text: 'Unter „Plan“ führt dich ein Assistent: 1. Wettkampf und Datum, 2. Erfahrung und aktueller Umfang, 3. deine Trainingstage und der lange Tag, 4. Vorschau mit Wochen, Phasen, Umfang und einer Beispielwoche. Erst „Plan erstellen“ speichert alles. Die Felder sind sinnvoll vorbelegt, Hinweise erklären jede Angabe. Später änderst du den Plan über „Plan neu erstellen“. Mehrere Ziele legst du über „+ Ziel“ an und wechselst oben zwischen ihnen, Heute und Auswertung folgen dem gewählten Ziel.',
  },
  {
    id: 'endurance-more',
    route: '/endurance',
    title: 'Zonen, Tempo und Import',
    text: 'Unter „Plan“ findest du „Zonen und Tempo“: Aus einer Referenzzeit, deinem Puls und deiner FTP berechnet die App Paces und Zonen. Läufe, Radfahrten und Schwimmeinheiten von Uhr oder Strava importierst du unter „Heute“ als GPX-, TCX- oder FIT-Datei.',
  },
  {
    id: 'profile',
    route: '/profile',
    target: 'nav-profile',
    title: 'Profil',
    text: 'Dein Gewicht mit Verlauf und Ziel, das Wochenziel mit Serie und deine Trainingsstatistiken.',
  },
  {
    id: 'settings',
    route: '/settings',
    title: 'Einstellungen und Backup',
    text: 'Da es keine Cloud gibt, sichert du deine Daten hier mit „Backup exportieren“. Mit dem Import holst du sie auf einem anderen Gerät oder nach einer Neuinstallation zurück. Außerdem kannst du Daten aus Strong übernehmen und Übungsbilder für offline laden.',
  },
  {
    id: 'done',
    route: '/workout',
    title: 'Fertig',
    text: 'Das war die Tour. Du kannst sie über „App-Tour“ auf der Startseite jederzeit wiederholen. Tipp fürs iPhone: Über „Teilen → Zum Home-Bildschirm“ wird die App wie eine normale App geöffnet und funktioniert auch offline.',
  },
];
