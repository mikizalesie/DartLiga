# Aktualizacja DartLiga PWA do wersji 1.1.1

## Naprawiony problem

W poprzedniej wersji użytkownik mógł wejść w konfigurację istniejącej ligi, zmienić format i ponownie wygenerować terminarz. Aplikacja pytała wtedy o usunięcie meczów i wyników, co sprawiało wrażenie, że nie można prowadzić kilku rozgrywek jednocześnie.

W wersji 1.1.1:

- nową ligę lub turniej tworzy się jako osobną pozycję,
- format rozgrywki z wygenerowanym terminarzem jest blokowany,
- nie można nadpisać terminarza zawierającego rozpoczęte lub zakończone mecze,
- dostępny jest przycisk **+ Nowa rozgrywka** na najważniejszych ekranach,
- opcja **Nowa na podstawie** kopiuje zawodników do nowej rozgrywki,
- poprzednie ligi, turnieje, tabele i wyniki pozostają zapisane.

## Wgranie aktualizacji na GitHub

1. Rozpakuj paczkę aktualizacyjną.
2. W repozytorium przejdź do **Code → Add file → Upload files**.
3. Wgraj pliki z paczki i zaakceptuj ich nadpisanie.
4. Kliknij **Commit changes**.
5. Poczekaj na zielony status w zakładce **Actions**.
6. Otwórz aplikację ponownie i sprawdź numer **1.1.1** w lewym dolnym rogu.

Nie trzeba ponownie wgrywać folderu `.github`.

## Zachowanie danych

Aktualizacja nie zmienia klucza danych w `localStorage`, dlatego dotychczasowe rozgrywki powinny pozostać zachowane. Dla bezpieczeństwa przed aktualizacją wykonaj eksport JSON w zakładce **Ustawienia**.

## Prawidłowy sposób utworzenia drugiej rozgrywki

1. Kliknij **+ Nowa rozgrywka**.
2. Wpisz nazwę, wybierz format i datę rozpoczęcia.
3. Dodaj zawodników albo użyj **Nowa na podstawie**, aby skopiować zawodników z obecnej ligi.
4. Wygeneruj terminarz.
5. Wróć do **Moje rozgrywki** — obie pozycje będą widoczne osobno.
