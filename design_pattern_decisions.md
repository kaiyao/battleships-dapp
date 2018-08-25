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