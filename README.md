# 🎯 DartLiga PWA 1.1.1

Aplikacja PWA do liczenia punktów w darcie oraz prowadzenia wielu niezależnych lig, faz grupowych i turniejów. Każda rozgrywka ma własnych zawodników, terminarz, wyniki, tabelę i statystyki.

## Najważniejsze funkcje

- licznik X01: 301, 501, 701 i 1001,
- mecze do wybranej liczby wygranych legów,
- kontrola BUST i cofanie ostatniej wizyty,
- liga „każdy z każdym”, faza grupowa i turniej pucharowy,
- wiele równoległych rozgrywek,
- archiwum rozgrywek aktywnych i zakończonych,
- automatyczna tabela wyników i bilans legów,
- statystyki: średnia 3-dart, 100+, 140+, 180, High Out i Best Leg,
- ręczne wpisywanie wyników,
- eksport i import całego archiwum JSON,
- zapis danych w `localStorage`,
- instalacja jako PWA i działanie offline.

## Bezpieczna obsługa wielu rozgrywek

Wersja 1.1.1 oddziela pojęcie **rozgrywki** od jej **formatu**.

- Nową ligę lub turniej tworzy się przyciskiem **+ Nowa rozgrywka**.
- Wygenerowanie terminarza nie usuwa żadnej innej ligi ani turnieju.
- Po utworzeniu terminarza format bieżącej rozgrywki jest blokowany, aby nie skasować wyników.
- Przycisk **Nowa na podstawie** tworzy osobną rozgrywkę i kopiuje listę zawodników, ale nie kopiuje meczów ani wyników.
- Terminarz z rozegranymi meczami nie może zostać nadpisany.

## Publikacja na GitHub Pages

Repozytorium zawiera workflow `.github/workflows/deploy-pages.yml`.

1. Wgraj pliki do głównego katalogu repozytorium.
2. Wejdź w **Settings → Pages**.
3. Ustaw **Source: GitHub Actions**.
4. Poczekaj na zielony status workflow **Publikacja DartLiga PWA** w zakładce **Actions**.

Adres aplikacji będzie miał postać:

```text
https://TWOJ-LOGIN.github.io/DartLiga/
```

## Aktualizacja istniejącej instalacji

Wgraj i nadpisz pliki:

```text
app.js
styles.css
index.html
sw.js
README.md
```

Folder `.github` może pozostać bez zmian. Dane zapisane w przeglądarce są zachowywane, ponieważ klucz archiwum nie został zmieniony.

Po publikacji otwórz aplikację ponownie. W lewym dolnym rogu powinien być widoczny numer **1.1.1**. Pliki `app.js` i `styles.css` mają numer wersji w adresie, dzięki czemu aktualizacja nie powinna utknąć w starym cache PWA.

## Uruchomienie lokalne

```bash
python -m http.server 8080
```

Następnie otwórz:

```text
http://localhost:8080
```

## Struktura repozytorium

```text
.github/workflows/deploy-pages.yml  automatyczna publikacja
icons/                             ikony PWA
index.html                         główny plik strony
styles.css                         wygląd aplikacji
app.js                             logika aplikacji
manifest.webmanifest               konfiguracja PWA
sw.js                              cache i działanie offline
.nojekyll                          wyłączenie Jekyll
LICENSE                            licencja MIT
README.md                          instrukcja
```

## Przechowywanie danych

Dane są lokalne dla danej przeglądarki i urządzenia. Przed większą aktualizacją warto wejść w **Ustawienia** i wykonać eksport całego archiwum do pliku JSON.
