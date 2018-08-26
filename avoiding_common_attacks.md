# Avoiding Common Attacks

## Logic Bugs
A set of automated tests perform tests on game scenarios to try to avoid logic bugs.

## Recursive call attacks:
Pull payments is used to avoid recursive call attack issues when sending ether. In general, external calls are avoided. Even when the Lobby contract calls the Battleship contract, it does the all the necessary work first before calling functions on the other contract.

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

The transaction that uses the most gas is actually creating a new game on the blockchain, as it tries to deploy a new BattleShop.sol contract. Note that in truffle.js the `solc` optimizer is enabled in order to reduce the contract size and make it deployable.

## Denial of Service
Denial of Service is avoided with the following:
1. Avoiding unbounded loops. The game works with a fixed size game board and all inputs are fixed size.
2. Having time-based limits. If the opponent stops playing the game, the remaining player will be able to end the game and get a refund after 24 hours.

## Force sending ether
Force sending ether is not an issue because the game only works on the amounts deposited by the players. Any extra balance is ignored.