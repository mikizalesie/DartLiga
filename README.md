# 🎯 DartLiga PWA 1.3.0

Aplikacja PWA do liczenia punktów w darcie oraz prowadzenia wielu niezależnych lig, turniejów i rozgrywek grupowych połączonych z automatyczną fazą pucharową.

## Najważniejsze funkcje

- licznik X01: 301, 501, 701 i 1001,
- wprowadzanie wyniku lotka po lotce: numer 1–20 oraz Singiel, Double lub Triple,
- osobne przyciski Outer Bull 25, Bull 50 i Pudło,
- automatyczne sumowanie wizyty i liczby użytych lotek,
- podpowiedzi checkout aktualizowane po każdej wybranej lotce,
- kontrola zakończenia lega na double lub Bull 50,
- zapis notacji rzutów, np. `T20 · T19 · D12`, w historii wizyt,
- wiele równoległych i archiwalnych rozgrywek,
- liga „każdy z każdym”,
- samodzielny turniej pucharowy,
- grupy automatycznie połączone z fazą pucharową,
- wybór liczby grup i liczby awansujących z każdej grupy,
- automatyczne utworzenie drabinki po ostatnim meczu grupowym,
- wyróżnienie miejsc premiowanych awansem w tabelach,
- osobna liczba wygranych legów dla każdego etapu fazy pucharowej,
- automatyczny awans zwycięzców do następnej rundy,
- rozstawienie kwalifikantów i unikanie rewanżu z tej samej grupy w pierwszej rundzie, gdy jest to możliwe,
- statystyki: średnia 3-dart, 100+, 140+, 180, High Out i Best Leg,
- eksport i import całego archiwum JSON,
- zapis danych w przeglądarce,
- instalacja jako PWA i działanie offline.

## Format „Grupy + faza pucharowa”

Podczas tworzenia rozgrywki ustalasz:

- liczbę grup,
- liczbę zawodników awansujących z każdej grupy,
- liczbę wygranych legów w meczach grupowych,
- liczbę wygranych legów osobno dla: 1/64, 1/32, 1/16, 1/8 finału, ćwierćfinału, półfinału i finału.

Po zakończeniu wszystkich meczów grupowych aplikacja automatycznie:

1. oblicza tabele grupowe,
2. wybiera ustaloną liczbę najlepszych zawodników,
3. tworzy drabinkę do najbliższej pełnej potęgi liczby 2,
4. przydziela wolne losy najwyżej rozstawionym zawodnikom, jeśli są potrzebne,
5. ustawia właściwy limit legów dla danego etapu.

Przy równej liczbie punktów decydują kolejno: bilans legów, liczba wygranych legów, średnia 3-dart i nazwa zawodnika.

## Publikacja na GitHub Pages

Repozytorium zawiera workflow `.github/workflows/deploy-pages.yml`.

1. Wgraj pliki do głównego katalogu repozytorium.
2. Wejdź w **Settings → Pages**.
3. Ustaw **Source: GitHub Actions**.
4. Poczekaj na zielony status workflow **Publikacja DartLiga PWA** w zakładce **Actions**.

Adres aplikacji:

```text
https://TWOJ-LOGIN.github.io/DartLiga/
```

## Aktualizacja istniejącej instalacji

Wgraj i nadpisz pliki z paczki aktualizacyjnej. Folder `.github` nie wymaga zmiany. Dane zapisane w przeglądarce zostają zachowane.

Po publikacji sprawdź numer **1.3.0** w lewym dolnym rogu aplikacji. W razie wyświetlania starej wersji wykonaj `Ctrl + F5` albo zamknij i ponownie uruchom zainstalowaną aplikację PWA.

## Uruchomienie lokalne

```bash
python -m http.server 8080
```

Następnie otwórz:

```text
http://localhost:8080
```

## Przechowywanie danych

Dane są lokalne dla danej przeglądarki i urządzenia. Przed większą aktualizacją warto wejść w **Ustawienia** i wykonać eksport całego archiwum do pliku JSON.
