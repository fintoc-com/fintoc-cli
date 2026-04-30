Output docs/demo.gif
Set Shell "zsh"
Set FontSize 15
Set Width 1000
Set Height 550
Set Theme "Catppuccin Mocha"
Set TypingSpeed 50ms
Set Padding 20
Sleep 500ms

# List payment_intents
Type "fintoc payment_intents list --status succeeded --limit 5"
Enter
Sleep 3s

# Doctor
Type "fintoc doctor"
Enter
Sleep 4s
