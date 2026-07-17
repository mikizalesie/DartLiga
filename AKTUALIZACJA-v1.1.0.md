# Aktualizacja DartLiga PWA do wersji 1.1.0

## Co zmienia aktualizacja

Aplikacja obsługuje teraz wiele niezależnych rozgrywek. Utworzenie nowej ligi, grupy albo turnieju nie kasuje poprzedniej rozgrywki. Na ekranie **Moje rozgrywki** znajdują się pozycje aktywne i zakończone.

## Aktualizacja repozytorium GitHub

W repozytorium `DartLiga` zastąp pliki z poprzedniej wersji zawartością nowej paczki. Najważniejsze zmienione pliki:

```text
app.js
styles.css
sw.js
index.html
manifest.webmanifest
README.md
```

Folder `.github` może pozostać bez zmian. Można również przesłać całą zawartość paczki i zatwierdzić nadpisanie plików.

Po wykonaniu commitu workflow **Publikacja DartLiga PWA** uruchomi się automatycznie. Poczekaj na zielony status w zakładce **Actions**.

## Zachowanie istniejących danych

Dane zapisane w przeglądarce przez wersję 1.0.1 zostaną automatycznie przeniesione do nowego archiwum jako pierwsza rozgrywka. Aktualizacja plików na GitHubie nie powinna usuwać dotychczasowych zawodników ani wyników.

Mimo to przed aktualizacją warto w obecnej aplikacji wykonać eksport JSON.

## Gdy nadal wyświetla się poprzednia wersja

1. Zamknij wszystkie karty z aplikacją.
2. Otwórz stronę ponownie.
3. W razie potrzeby wykonaj twarde odświeżenie `Ctrl + F5`.
4. Numer nowej wersji w lewym dolnym rogu powinien wynosić `1.1.0`.
