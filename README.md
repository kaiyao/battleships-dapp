# Battleship DApp Readme

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

I have only tried the app in Chrome 68. Please try to use Chrome if you have problems with other browsers.

### MetaMask
Obviously, MetaMask must be configured to use the same Custom RPC (`http://<your ip>:8545`) for both browsers to be on the same private network and interact with each other.

MetaMask must also be using the same seed words on both browsers to interact with ganache-cli.

MetaMask must also be using a different account (click the icon near the top right of the Metamask popup - the one with the human icon and two arrows around it) and click "Create Account".

One browser thus should be using "Account 1", and the other browser should be using "Account 2".

If successfully set up, you should be able to start a game on one browser and join the game on the other browser.

If you switch accounts in MetaMask, you will need to refresh the page.

## Code Structure

The game contract logic is implemented as two contracts, contracts/Lobby.sol and contracts/Battleship.sol.
Lobby.sol is the "game lobby" that you can create/join games.
Battleship.sol contains the actual game itself.
BattleshipTest.sol contains additional functions used only in the automated tests.

The frontend UI is largely contained in index.html and js/app.js.

## Troubleshooting
- Sometimes, the first time the page loads in Chrome, there is some Metamask issues (which you can see in the Chrome developer console). Just try to refresh the page and it should work the 2nd time.
- If there is any issues with the page, try to refresh the page.
- This app uses localstorage in the browser to store the positions of the ships before they are revealed at the end of the game. If you are using some browser/plugins that block localstorage, this can cause the app to not work (e.g. Brave browser requires you to disable site shield).
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

## UI Manual Testing
Should you wish to look at the UI and play the game to the end, it may take a long while to complete one normal game. You can try to reduce the number of ships in the game by changing the variables at the top of `Battleship.sol` to reduce the time taken to try out one game.

Once changed, you may need to redeploy and reset everything (see the "Reset all stuff" section above). This is because the Lobby deploys a new Battleship contract for each game and old contracts will still be on the blockchain if you do not reset everything.

Don't forget to change the values back (and redeploy) after testing as the unit tests depend on the default values.
	
## Libraries/EthPM
The [OpenZeppelin](https://github.com/OpenZeppelin/openzeppelin-solidity) library is used in the code. Specifically, the `OnlyOwner`, `PullPayments` and `SafeMath` libraries are used.
Even though there is an ethpm.json the version of OpenZeppelin in ethpm is much older than the version in npm. Hence the npm install is used instead.









