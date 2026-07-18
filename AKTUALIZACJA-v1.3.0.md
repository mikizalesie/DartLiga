# Aktualizacja DartLiga PWA do wersji 1.3.0

## Nowy licznik lotka po lotce

- nie trzeba już ręcznie wpisywać sumy wizyty,
- najpierw wybierasz **Singiel**, **Double** albo **Triple**,
- następnie wybierasz numer pola od **1 do 20**,
- dostępne są osobne przyciski **Outer Bull 25**, **Bull 50** i **Pudło 0**,
- aplikacja pokazuje trzy pola dla kolejnych lotek i automatycznie liczy sumę,
- checkout może zostać zapisany po jednej, dwóch albo trzech lotkach,
- zwykłą wizytę zatwierdzasz po trzech lotkach,
- po błędnym wyborze możesz cofnąć jedną lotkę albo wyczyścić całą bieżącą wizytę.

## Podpowiedzi checkout

Gdy wynik można zamknąć w liczbie pozostałych lotek, nad panelem wprowadzania pojawia się podpowiedź, np.:

```text
T20 · T19 · D12
```

Podpowiedź zmienia się po każdej wybranej lotce. Dla wyniku 141 po trafieniu `T20` aplikacja pokaże już tylko `T19 · D12`.

## Zasady i historia

- zakończenie lega jest poprawne na **Double** albo **Bull 50**,
- zejście do zera singlem lub triplem jest oznaczane jako **BUST**,
- liczba wykorzystanych lotek przy checkout jest liczona automatycznie,
- historia wizyt przechowuje także dokładną notację, np. `T20 · T19 · D12`,
- dotychczasowe mecze i archiwum rozgrywek pozostają zachowane.

## Aktualizacja GitHub Pages

1. Wykonaj eksport JSON jako kopię bezpieczeństwa.
2. Rozpakuj paczkę aktualizacyjną.
3. W GitHub wybierz **Code → Add file → Upload files**.
4. Wgraj i nadpisz pliki.
5. Kliknij **Commit changes**.
6. Poczekaj na zielony status w **Actions**.
7. Otwórz aplikację i sprawdź numer **1.3.0**.
