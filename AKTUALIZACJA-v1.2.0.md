# Aktualizacja DartLiga PWA do wersji 1.2.0

## Nowe funkcje

- format grupowy jest teraz połączony z automatyczną fazą pucharową,
- podczas tworzenia rozgrywki wybierasz liczbę grup,
- wybierasz liczbę zawodników awansujących z każdej grupy,
- po ostatnim wyniku grupowym drabinka powstaje automatycznie,
- miejsca premiowane awansem są wyróżnione w tabeli,
- każdy etap fazy pucharowej może mieć inną liczbę legów potrzebnych do wygrania,
- ustawienia są zapisywane osobno dla 1/64, 1/32, 1/16, 1/8 finału, ćwierćfinału, półfinału i finału,
- licznik meczu automatycznie pobiera limit legów właściwy dla etapu,
- przy niepełnej drabince aplikacja przydziela wolne losy,
- przy zmianie wyniku grupowego utworzona drabinka jest bezpiecznie usuwana i tworzona ponownie po ponownym zamknięciu grup.

## Aktualizacja GitHub Pages

1. Wykonaj eksport JSON jako kopię bezpieczeństwa.
2. Rozpakuj paczkę aktualizacyjną.
3. W GitHub wybierz **Code → Add file → Upload files**.
4. Wgraj i nadpisz pliki.
5. Kliknij **Commit changes**.
6. Poczekaj na zielony status w **Actions**.
7. Otwórz aplikację i sprawdź numer **1.2.0**.

Dotychczasowe ligi, turnieje, zawodnicy i wyniki pozostają zapisane. Struktura magazynu danych nie została zmieniona.
