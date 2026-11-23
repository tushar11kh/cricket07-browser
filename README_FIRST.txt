===============================================================================
  CRICKET 07 - PLAY TOGETHER ON THE SAME WI-FI (LAN)
  Read this once before your first match. It takes 5 minutes to set up.
===============================================================================

WHAT EACH PLAYER NEEDS
----------------------
  1. Your own copy of EA Cricket 07 for PC (the game folder with Cricket07.exe
     and the Data folder).
  2. This folder (the one holding "play_mac.command" / "play_windows.bat").
  3. A current Chrome, Edge, or Safari.
  4. Both players on the SAME Wi-Fi.
  5. Python 3 installed. (The player who HOSTS also needs Node installed.)


*** THE ONE RULE THAT MATTERS MOST ***
---------------------------------------
  Both players MUST use the EXACT SAME two things:

     (a) the SAME build  -> the "build_web" folder in here
     (b) the SAME game folder -> the same copy of Cricket 07

  The game runs the identical simulation on both machines and only sends button
  presses between you, so if the build or the game files differ by even a little,
  it will refuse to start and say:

     "Players have different game builds or files..."

  HOW TO GET THIS RIGHT (do this before playing the first time):
     - ONE of you builds the game, then sends the OTHER person BOTH:
          * this whole folder (so you share the same "build_web")
          * a zip of your Cricket 07 game folder
     - The other person uses exactly those. Do not build your own separately,
       and do not use a different copy/version of the game.

  (Mac vs Windows is fine - that does not matter. Only the build and the game
   files have to match.)


===============================================================================
  HOSTING A MATCH  (one player does this)
===============================================================================

  Mac:      double-click  play_mac.command
  Windows:  double-click  play_windows.bat

  A black window opens and your browser opens the game. Keep that window open
  the whole time you play - closing it stops everything.

  First time only: if your computer asks "Allow incoming network connections?"
  for Python or Node, click ALLOW. (Without it your friend cannot reach you.)

  Then in the game:
     1. Pick your game folder when asked (just once; it stays in your browser).
     2. Click  Play Multiplayer  ->  Create room.
     3. Click  Copy invite link  and send that link to your friend
        (WhatsApp, Messages, email - anything).
     4. Wait on the lobby screen until your friend appears, then start.


===============================================================================
  JOINING A MATCH  (the other player does this)
===============================================================================

  1. Double-click your launcher (play_mac.command or play_windows.bat).
     Your browser opens the game. Keep the black window open while you play.
  2. Pick your game folder when asked (the SAME copy as the host - see THE ONE
     RULE above).
  3. Paste the invite link your friend sent you into your browser's address bar
     and press Enter. (You can use whichever browser you prefer.)
  4. You land in the lobby. Wait for the host to start.

  You do NOT need Node installed - only the host does.


===============================================================================
  IF SOMETHING GOES WRONG
===============================================================================

  "Players have different game builds or files..."
      You are not on the same build and/or the same game copy.
      -> Re-read THE ONE RULE above. Make sure you both got the same
         "build_web" folder and the same Cricket 07 game folder from one person.

  Friend cannot connect / stuck on "Connecting..."
      -> You must both be on the SAME Wi-Fi.
      -> On the host, allow Python/Node through the firewall (see HOSTING).
      -> Make sure the host's black window is still open.

  "This browser has no WebGPU"
      -> Update to a current Chrome or Edge, or Safari on a recent macOS/iOS.

  Nothing happens when I double-click (Mac)
      -> Right-click the file -> Open -> Open, to get past the first-time
         security prompt. After that a normal double-click works.

  "needs Python 3"
      -> Install Python 3 from python.org (on Windows, tick "Add to PATH"),
         then double-click the launcher again.


-------------------------------------------------------------------------------
  You own the game; this just lets it run in a browser. Have fun.
-------------------------------------------------------------------------------
