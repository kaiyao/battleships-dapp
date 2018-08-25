battleship

# README

This project implements a DApp Battleship game in Solidity.

## Getting Started
To run it, please do the following:
- Ensure you have truffle and ganache-cli installed (as well as all related dependencies like node, npm, etc.).
- Start ganache-cli in one command line window.
- In another command line window, do the following:
  - git clone this repository
  - change to the directory where the code is in
  - run `npm install` to install the dependencies
  - run `truffle compile`
  - run `truffle migrate`
  - run `truffle test` to run the tests
  - run `npm run dev` to launch the server and browser

## Testing interactions with two browsers/computers

### Dev Server/Browser
The dev server has been configured to listen on 0.0.0.0 port 3000, this allows you to open the URL on another browser/computer/VM (go to `http://<your ip>:3000/` to visit the same page and interact as two different players).

Lite-server is used as the dev server (same as in pet shop tutorial) but the following changes have been made:
- Listen on 0.0.0.0
- Ghost mode is off by default

Ghost mode is normally on by default and it syncs clicks etc. which messes things up (since each player is supposed to do their own stuff rather than the same actions). If you need to change it go to localhost:3001 to access the browsersync configuration. Then click "Sync Options" on the left, and click "Disable All" to disable all synchorization.

I have only tried the app in Chrome 68. Please try to Chrome if you have problems with other browsers.

### MetaMask
Obviously, MetaMask must be configured to use the same Custom RPC (`http://<your ip>:8545`) for both browsers to be on the same private network and interact with each other.

MetaMask must also be using the same seed words on both browsers to interact with ganache-cli.

MetaMask must also be using a different account (click the icon near the top right of the Metamask popup - the one with the human icon and two arrows around it) and click "Create Account".

One browser thus should be using "Account 1", and the other browser should be using "Account 2".

If successfully set up, you should be able to start a game on one browser and join the game on the other browser.

If you switch accounts in MetaMask, you will need to refresh the page.

## Code Structure

The logic is implemented as two contracts, contracts/Lobby.sol and contracts/Battleship.sol.
Lobby.sol is the "game lobby" that you can create/join games.
Battleship.sol contains the actual game itself.
BattleshipTest.sol contains additional functions used only in the automated tests.

## Troubleshooting
- Sometimes, the first time the page loads in Chrome, there is some Metamask issues (which you can see in the Chrome developer console). Just try to refresh the page and it should work the 2nd time.
- If there is any issues with the page, try to refresh the page.
- This app uses localstorage to store the positions of the ships before they are revealed at the end of the game. If you are using some browser/plugins that block localstorage, this can be an issue (e.g. Brave browser requires you to disable site shield).
- The final withdrawal of winnings/refunds seems to require more gas that what MetaMask estimates by default which causes the transaction to fail (it says revert in the Chrome developer console). You need to set this gas value manually.

### Reset all stuff
Sometimes, things just don't work (out of sync, "the tx doesn't have the correct nonce", or whatever). When this happens, this is what I do:
- close and restart ganache-cli
- `truffle compile`
- `truffle migrate --reset`
- `npm run dev`
- in the MetaMask extension, for all the test accounts used, click on the 3 lines icon at the top right -> Settings -> Reset Account
- refresh the page in the browser and try again

## Tests
The tests are contained in tests/lobby.js and tests/battleship.js

Each tests the corresponding contract.

Some of the test cases in battleship.js use a contract BattleshipTest.sol. This is to minimize the size of the Battleship.sol contract, which was exceeding the max contract size. This contract inherits the main Battleship.sol contract and adds a few functions that are only used during testing - batch actions, changing time, etc.

The tests aim to test the various scenarios/flows of the whole game, and that the contract enforces the game rules. E.g. 
 - test that you must take turns to make a shot
 - test that you must submit the result of the previous shot before making a new shot
 - test that overlapping ships are detected (and player loses)
 - test that incorrectly reported shops are detected (and player loses)
 - test that player can end game if the game takes too long (prevent DoS attack)
 - etc.

Each test has a one-line description to describe what it is checking for.

Note that some of the tests may take some time (20-30 seconds ?). This is normal as some of the tests involve simulating an entire battleship game with 20+ moves per player.
	
## Libraries/EthPM

The [OpenZeppelin](https://github.com/OpenZeppelin/openzeppelin-solidity) library is used in the code. Specifically, the `OnlyOwner`, `PullPayments` and `SafeMath` libraries are used.
Even though there is an ethpm.json the version of OpenZeppelin in ethpm is much older than the version in npm. Hence the npm install is used instead.


# design_pattern_desicions.md

# Design Pattern Decisions

## Commit/Reveal
The commit/reveal pattern forms the basis of the battleship game. This is required as we do not want the opponent to be able to peek at the blockchain to see the opponent's ship locations.

## Circuit Breaker/Emergency Stop
The game implements the Circuit Breaker/Emergency Stop pattern. The owner of the Battleship contract can call the `emergencyStop()` function which ends a game with a draw, and allows players to withdraw their bets. This is to allow the owner to stop a running game if an exploit or bug is found in the game logic.

## Pull Payments
The game implements pull payments. When the game has ended, players call the withdrawPayments (implemented in the OpenZepplin PullPayments library) to withdraw their winnings/refunds. It protects against re-entrancy issues.

## State Machine
A state machine pattern is implemented because it lends itself naturally to the nature of the Battleship game. There are various phases: creation, adding players, placing ships, making shots, revealing ships, and finally determining the winner.

## Fail early and fail loud
This is followed in most user-facing functions with require statements and modifiers. However, some internal functions do not follow this (esp. those that check for the validity of the ship placement/move reporting). This is because the functions are also used in the computation of the winner and thus it should not fail immediately (e.g. if a player is found cheating, the other player wins).

## Restricting Access
The functions that change the game state are marked with "onlyPlayer" modifiers. This restricts those functions to the players. The getters (functions that retrieve the game state) are not restricted in any way, and could be used by other accounts to "spectate" the game.

In addition the onlyOwner modifier from the OpenZeppeplin Ownable contract restricts access to sensitive functions like `emergencyStop()`

## Auto Deprecation
This is not used because the game mechanism itself has its own "expiry" mechanism whereby the game ends if it takes too long.

## Mortal
This is not implemented. I think if the owner of the contract is given access to destroy the contract and return all funds to the owner, would the participants be willing to bet?

## Speed Bump
This is not implemented as it seems to be unnecessary in the context of a game, where we do not expect large sums in the betting, thus the risk is low.


# avoiding_common_attacks.md

# Avoiding Common Attacks

## Logic Bugs
A set of automated tests perform tests on game scenarios to try to avoid logic bugs.

## Recursive call attacks:
Pull payments is used to avoid recursive call attacks. External calls are avoided.??

## Overflow
User inputs are validated. E.g. a shot's x, y coordinate is required to be within the board dimensions.

For cases where arithmetic is used on user inputs before validation (e.g. check that for a horizontally placed ship, the  starting x coordinate + length is less than the board width) we use the SafeMath library provided by OpenZepplin.

## Poison data
Issues with poison data are avoided by validating user input.

## Exposed functions
Exposed functions are avoided by using appropriate modifiers (onlyPlayer, onlyOwner, etc.). No functions are implicitly public. In particular, functions that specifically modify the game state for a particular player have the onlyPlayer modifier.

## Exposed data
Exposure of data is avoided by using the commit/reveal pattern. All other data is non-sensitive.

## Timestamp vulnerabilities
Timestamp vulnerabilites are avoided by having a sufficent margin for time-based operations. Currently it is set to 24 hours. As such, the game is not dependent on the exact time and will not have issues even if the time is off by a few minutes.

## Contract Administration Risk
Contract administration risk is reduced by making the only action that the owner can do is to decide the game is a draw and refund the participants. While currently the game uses only one admin (the owner), the risk is low as a result.

## Cross Chain Replay
Cross chain replay can be an issue. If the chain forks halfway in one game and the subsequently the game is finished, the one who lost can theoretically replay the moves on the new chain but change his/her moves so that on the new chain, he/she wins.

## Gas Limits
Gas limit issues are avoided by not having unbounded loops. All loops in the game logic are bounded by the board size, and will at worst loop through every single square on the board. There are also no dynamic-size arrays in the game for this reason.

In the lobby, there are dynamic arrays for the games. But there is no loop over the arrays, so this is not an issue.

In addition, in `truffle.js` a 6000000 gas limit has been configured (which is lower than that on TestNets and the MainNet), and the unit tests pass.

The transaction that uses the most gas is actually creating a new game on the blockchain, as it tries to deploy a new BattleShop.sol contract.

## Denial of Service
Denial of Service is avoided with the following:
1. Avoiding unbounded loops. The game works with a fixed size game board and all inputs are fixed size.
2. Having time-based limits. If the opponent stops playing the game, the remaining player will be able to end the game and get a refund after 24 hours.

## Force sending ether
Force sending ether is not an issue because the game only works on the amounts deposited by the players. Any extra balance is ignored.






