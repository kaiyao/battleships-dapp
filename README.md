battleship

README
======

This project implements a Battleship game.

To run it, please do the following:
Ensure you have truffle and ganache-cli installed.
Start ganache-cli in one command line window.
In another command line window, do the following:
- change to the directory where the code is in
- run "truffle compile"
- run "truffle migrate"
- run "truffle test" to run the tests
- run "npm run dev" to launch the server and browser

The dev server has been configured to listen on 0.0.0.0 instead of the default localhost, this allows you to open the URL on another browser/computer/VM to visit the same page and interact as two different players.
Note that lite-server by default turns on browsersync which messes things up (since each player is supposed to do their own stuff rather than the same actions). Go to localhost:3001 to access the browsersync configuration. Then click "Sync Options" on the left, and click "Disable All" to disable all synchorization.
Obviously, Metamask must be configured to use the same Custom RPC (http://[your IP]:8545) for both browsers to be on the same private network and interact with each other.
Metamask must also be using the same seed words on both browsers to interact with ganache-cli.
Metamask must also be using a different account (click the icon near the top right of the Metamask popup - the one with the human icon and two arrows around it) and click "Create Account".
One browser thus should be using "Account 1", and the other browser should be using "Account 2".

If successfully set up, you should be able to start a game on one browser and join the game on the other browser.

I have only tried the app in Chrome 68. Please try to Chrome if you have problems with other browsers.

The logic is implemented as two contracts, contracts/Lobby.sol and contracts/Battleship.sol.
Lobby.sol is the "game lobby" that you can create/join games.
Battleship.sol contains the actual game itself.

Troubleshooting:
- Sometimes, the first time the page loads in Chrome, there is some Metamask issues (which you can see in the Chrome developer console). Just try to refresh the page and it should work the 2nd time.
- If there is any issues with the page, try to refresh the page.
- This app uses localstorage to store the positions of the ships before they are revealed at the end of the game. If you are using some browser/plugins that block localstorage, this can be an issue (e.g. Brave browser seems to not work).

Tests
=====
The tests are contained in tests/lobby.js and tests/battleship.js

Each tests the corresponding contract.

Note that some of the test cases in battleship.js use a contract BattleshipTest.sol. This is to minimize the size of the Battleship.sol contract, which was exceeding the max contract size.
This contract inherits the main Battleship.sol contract and adds a few functions that are only used during testing - batch actions, changing time, etc.
The tests aim to test the various scenarios/flows of the whole game, and that the contract enforces the game rules. 
E.g. 
 - test that you must take turns to make a shot
 - test that you must submit the result of the previous shot before making a new shot
 - test that overlapping ships are detected (and player loses)
 - test that incorrectly reported shops are detected (and player loses)
 - test that player can end game if the game takes too long (prevent DoS attack)
 - etc.
You can see a list of the tests and descriptions here:

  Contract: Game startup
    ✓ should be able add players (180ms)
    ✓ state should change accordingly (127ms)
    ✓ should not be able add two same players (173ms)
    ✓ should not be able add three players (136ms)

  Contract: Game add (hidden) ships
    ✓ should be able add ships with only one player (206ms)
    ✓ should be able add ships with two players (293ms)
    ✓ should not be able add ships if not a player (49ms)
    ✓ should not be able add ships outside of number of ships allowed (80ms)

  Contract: Game check ships have been placed
    ✓ should change state once both players have placed ships (689ms)
    ✓ should not be able to make shots until ships have been placed (835ms)

  Contract: Game make shots (assumes boardShips = [5,4,3,3,2] and boardWidth = boardHeight = 10)
    ✓ should not be able to make shots if not a player
    ✓ player 1 should be able to make first shot (132ms)
    ✓ player 2 should not be able to make first shot
    ✓ player 1 should not be able to make two shots consecutively (first shot case) (70ms)
    ✓ player 1 should not be able to make two shots consecutively (subsequent shot case) (205ms)
    ✓ player 2 should not be able to make two shots consecutively (first shot case) (142ms)
    ✓ player 2 should not be able to make two shots consecutively (subsequent shot case) (252ms)
    ✓ should not be able to make move without updating result of opponent's previous shot (77ms)

  Contract: Game test batch add ships and batch move test functions
    ✓ batch ship add and move should match normal ship add and move (5750ms)

  Contract: Game endings - timeouts
    ✓ should not be allowed to end game before waiting 24 hours for 2nd player (210ms)
    ✓ should not be allowed to end game before waiting 24 hours ships to be submitted (511ms)
    ✓ should not be allowed to end game before waiting 24 hours since game started (596ms)

  Contract: Game endings (assumes boardShips = [5,4,3,3,2] and boardWidth = boardHeight = 10)
    ✓ should determine winner correctly (player 1 wins) (1171ms)
    ✓ should determine winner correctly (player 2 wins) (1240ms)
    ✓ should detect wrongly reported moves (player 1) (1013ms)
    ✓ should detect wrongly reported moves (player 2) (1083ms)
    ✓ should detect wrongly reported moves (both) (1062ms)
    ✓ should not allow declare game finished if not enough hits (244ms)
    ✓ both players don't reveal ships 24 hours after finished, allow the game to end (580ms)
    ✓ should not allow declare game ended if both players not yet revealed ships or timeout (778ms)

  Contract: Game detects invalid ship placements (assumes boardShips = [5,4,3,3,2] and boardWidth = boardHeight = 10)
    ✓ should not allow overlapping ships (1353ms)
    ✓ should not allow ships to be placed out of board (1081ms)

  Contract: Lobby open games
    ✓ should be able to create new open game (152ms)
    ✓ should be able to join open game (144ms)

  Contract: Lobby non-open games
    ✓ should be able to create new non-open game (247ms)

  Contract: Lobby test add two same players
    ✓ should not be allowed to create game with opponent being the same player as caller (87ms)
    ✓ should not be allowed to join game with same player as first player (100ms)
	
	
Libraries/EthPM
===============

The zepplin library is used in the code. Specifically, the OnlyOwner, PullPayments and SafeMath libraries are used.


design_pattern_desicions.md
===========================

Design Pattern Decisions
========================

Commit/Reveal

The commit/reveal pattern forms the basis of the battleship game. This is required as we do not want the opponent to be able to peek at the blockchain to see the opponent's ship locations.

Circuit Breaker/Emergency Stop

The game implements the Circuit Breaker/Emergency Stop pattern. The owner of the Battleship contract can choose to switch the game to end with a draw at any time and allow users to withdraw their bets. This is to allow the owner to stop a running game if an exploit or bug is found in the game logic.

Pull Payments

The game implements pull payments. When the game has ended, players call the withdrawPayments (implemented in the zepplin PullPayments library) to withdraw their winnings/refunds. It protects against re-entrancy and denial of service attacks.

State Machine

A state machine pattern is implemented because it lends itself naturally to the nature of the Battleship game. There are various phases: creation, adding players, placing ships, making shots, revealing ships, and finally determining the winner.

Fail early and fail loud

This is followed in most user-facing functions. However, some internal functions do not follow this (esp. those that check for the validity of the ship placement/move reporting). This is because the function is also used in the computation of the winner and thus it should not fail immediately (e.g. if a player is found cheating, the other player wins).

Restricting Access

The functions that change the game state are marked with "onlyPlayer" modifiers. This restricts those functions to the players. The getters (functions that retrieve the game state) are not restricted in any way, and could be used by other accounts to "spectate" the game.

Auto Deprecation

This is not used because the game mechanism itself has its own "expiry" mechanism whereby the game ends if it takes too long.

Mortal

This is not implemented.

Speed Bump


avoiding_common_attacks.md
==========================

Logic Bugs:
A set of automated tests perform tests on game scenarios to try to avoid logic bugs.

Recursive call attacks:
Pull payments is used to avoid recursive call attacks. External calls are avoided.??

Overflow:
User inputs are validated. E.g. a shot's x, y coordinate is required to be within the board dimensions.
For cases where arithmetic is used on user inputs before validation (e.g. check that for a horizontally placed ship, the  starting x coordinate + length is less than the board width) we use the SafeMath library provided by zepplin.

Poison data:
Poison data is avoided by validating user input.

Exposed functions:
Exposed functions is avoided by having an onlyPlayer modifier. Functions that specifically modify the game state for a particular player have that modifier.

Exposed data:
Exposure of data is avoided by using the commit/reveal pattern. All other data is non-sensitive.

Timestamp vulnerabilities:
Timestamp vulnerabilites are avoided by having a 24 hour "leeway" for time-based operations. As such, the game is not dependent on the exact time and will not have issues even if the time is off by a few minutes.

Contract Administration Risk:
Contract administration risk is reduced by making the only action that the owner can do is to decide the game is a draw and refund the participants. While currently the game uses only one admin (the owner), the risk is low as a result.

Cross Chain Replay:
Cross chain replay can be an issue. If the chain forks halfway in one game and the subsequently the game is finished, the one who lost can theoretically replay the moves on the new chain but change his/her moves so that on the new chain, he/she wins.

Gas Limits:
Gas limit issues are avoided by not having unbounded loops. All loops in the game logic are bounded by the board size, and will at worst loop through every single square on the board. There are also no dynamic-size arrays in the game for this reason.
In the lobby, there are dynamic arrays for the games. But there is no loop over the arrays, so this is not an issue.
In addition, in truffle.js a 6000000 gas limit has been configured (which is lower than that on TestNets and the MainNet), and the unit tests pass.
The transaction that uses the most gas is actually creating a new game on the blockchain, as it tries to deploy a new BattleShop.sol contract.

Denial of Service:
Denial of Service is avoided with the following:
1. Avoiding unbounded loops. The game works with a fixed size game board and all inputs are fixed size.
2. Having time-based limits. If the opponent stops playing the game, the remaining player will be able to end the game and get a refund after 24 hours.

Force sending ether is not an issue because the game only works on the amounts deposited by the players. Any extra balance is ignored.







