pragma solidity ^0.4.23;

import "../node_modules/openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "../node_modules/openzeppelin-solidity/contracts/payment/PullPayment.sol";
import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";

/** @title Battleship game contract */
contract Battleship is Ownable, PullPayment {
    using SafeMath for uint256;
    
    // ************************************
    // * Configure the game settings here *
    // ************************************
    // Width of the game board (default 10)
    uint public constant boardWidth = 10;
    // Height of the game board (default 10)
    uint public constant boardHeight = 10;
    // Number of ships each player gets (default 5)
    uint constant shipsPerPlayer = 5;
    // Length of each ship in an array (default [5, 4, 3, 3, 2])
    uint[shipsPerPlayer] public boardShips = [5, 4, 3, 3, 2];
    // Sum of the spaces used by all the ships (default 5 + 4 + 3 + 3 + 2 = 17)
    // This is used to determine the number of hits required before a player wins 
    uint constant shipSpaces = 5 + 4 + 3 + 3 + 2;
    
    struct Ship {
        uint width;
        uint height;
        uint x;
        uint y;
    }
    
    enum MoveResult { Unknown, Miss, Hit }
    
    struct Move {
        uint x;
        uint y;
        MoveResult result;
        uint shipNumber;
        // We need to store the ship number (if Hit) for the move, because the game rules say:
        // You call: "D-4"
        // Alex answers: "Hit. Cruiser."
        // so for each move, we need x, y (D-4), result (Hit), and shipNumber (Cruiser)     
    }

    struct PlayerInfo {
        uint deposit;
        bytes32[shipsPerPlayer] hiddenShips;
        Ship[shipsPerPlayer] revealShips;   
        Move[boardWidth * boardHeight] moves;
        uint movesCount;
    }
    
    /*
        Created: Game is created, waiting for players to join (ships may be added too)
        PlayersJoined: Players have joined, waiting for ships to be added
        Started: Players have placed their ships and can start to hit each other
        Finished: One player has hit all the squares of the opponent ship (i.e. hitCount > sum(boardShips))
        (or someone declares they have lost)??
        PayoutReady: Winner has been determined, players can claim their payment
    */
    //enum GameState { Created, PlayersJoined, Started, Ended, ShipsRevealed, WinnerDeclared } ????
    enum GameState { Created, PlayersJoined, Started, Finished, ShipsRevealed, Ended }
    GameState public gameState;

    enum GameEndState { Unknown, Draw, Player1WinsValidGame, Player2WinsValidGame, Player1WinsInvalidGame, Player2WinsInvalidGame }
    GameEndState public gameEndState;

    // game must start within time limit of creation otherwise refund
    uint public createdAt;
    // game must finish within time limit of starting otherwise refund
    // game finish => sunk squares of 1 player == number of squares of ships
    uint public startedAt;
    // players must reveal ships within time limit of finishing
    uint public finishedAt;
    // players must make move once game started otherwise they lose
    uint public lastMoveAt;

    // if both players reveal, app checks validity of ships
    // - ships must not overlap
    // - hits/misses accurately reported
    // - declares winner to be the player that first sunk all the ships
    // if only one player reveals within time limit
    // - declare this player the winner
    // if both players don't reveal within time limit
    // - declare draw, refund
    
    address public player1;
    address public player2;
    uint public betAmount;
    bool winningsProcessed = false;
    
    mapping (address => PlayerInfo) public players;

    bool public testMode;
    uint public testModeTimestamp;

    modifier onlyPlayers()
    {
        require(
            msg.sender == player1 || msg.sender == player2,
            "Only players."
        );
        // Do not forget the "_;"! It will
        // be replaced by the actual function
        // body when the modifier is used.
        _;
    }

    event StateChanged (
        address indexed _from,
        GameState newState
    );

    event ShipAdded (
        address indexed _from,
        uint shipNumber
    );

    event MoveMade (
        address indexed _from,
        uint x,
        uint y
    );

    event MoveUpdated (
        address indexed _from,
        MoveResult moveResult,
        uint shipNumber
    );

    event DepositMade (
        address indexed _from,
        uint indexed amount,
        uint indexed refund
    );

    event PaidToEscrow (
        address indexed _from,
        uint indexed amount
    );

    event Logs (
        address indexed _from,
        string _data
    );
    
    constructor(uint _betAmount) public {    
        gameState = GameState.Created;
        createdAt = getTimestamp();
        betAmount = _betAmount;
    }

    // ***************************
    // * Miscellaneous functions *
    // ***************************

    /** @dev Performs an emergency stop on the contract and lets players claim refunds
      */
    function emergencyStop() public onlyOwner {
        gameState = GameState.Ended;
        gameEndState = GameEndState.Draw;
        processWinnings();
    }

    /** @dev Gets the current timestamp (or a fixed timestamp in test mode)
      *      This function exists to ease testing of time-based operations. 
      *      In test mode the timestamp can be changed arbitrarily (see BattleshipTest.sol).
      * @return The current time in seconds since the unix epoch.
      */
    function getTimestamp() public view returns (uint) {
        if (testMode) {
            return testModeTimestamp;
        } else {
            return block.timestamp;
        }
    }

    /** @dev Gets the list of ships (in ship lengths) specified in the contract for games
      * @return Array of uint e.g. [5, 4, 3, 3, 2] is 
      *         1 ship of length 5, 1 ship of length 4, 2 ships of length 3 and 1 ship of length 2
      */
    function getBoardShips() public view returns (uint[shipsPerPlayer]) {
        return boardShips;
    }

    /** @dev Gets the address of the opponent of the sender
      * @return Address of the opponent
      */
    function getOpponentAddress() public view onlyPlayers returns (address) {
        return getOpponentAddressForPlayer(msg.sender);
    }

    /** @dev Gets the address of the opponent of a specified player
      * @param player The address of a player to get the opponent of
      * @return Address of the opponent
      */
    function getOpponentAddressForPlayer(address player) public view returns (address) {
        require(player == player1 || player == player2);
        require(player1 != 0 && player2 != 0);
        if (player1 == player) {
            return player2;
        } else {
            return player1;
        }
    }

    /** @dev Calculates the hash for committing a ship
      *      Note: this is a pure function which means no storage is touched
      *      thus the ship positions should not be revealed on the blockchain
      *      This was implemented for testing and also because it seems quite complicated 
      *      to calculate the same hash in Javascript
      * @param width The width of the ship
      * @param height The height of the ship 
      *               (while this function does not check, technically the width or height must be 1)
      * @param x The x-coordinate of the topleft most square of the ship (coordinates are 0-indexed from top left)
      * @param y The y-coordinate of the topleft most square of the ship (coordinates are 0-indexed from top left)
      * @return The calculated hash
      */
    function calculateCommitHash(uint width, uint height, uint x, uint y, bytes32 nonce) public pure returns (bytes32) {
        bytes32 calculatedCommitHash = keccak256(abi.encodePacked(width, height, x, y, nonce));
        return calculatedCommitHash;
    }

    // ******************
    // * Adding Players *
    // ******************
    // The following functions are for adding players to the game.
    // Once both players have been added, the game will move to "PlayersJoined" state.

    /** @dev Joins the sender of the message to the game
      */    
    function joinGame() public {
        joinGameForPlayer(msg.sender);
    }

    /** @dev Joins a specified account to the game. This is to allow adding specified opponents
      * @param newPlayer The address of the player's account
      */
    function joinGameForPlayer(address newPlayer) public {
        require(gameState == GameState.Created);
        require(newPlayer != player1 && newPlayer != player2);

        if (player1 == 0) {
            player1 = newPlayer;
        } else {            
            player2 = newPlayer;
        }

        if (player1 != 0 && player2 != 0) {
            gameState = GameState.PlayersJoined;
            emit StateChanged(msg.sender, gameState);
        }
    }

    // **************
    // * Place Bets *
    // **************

    /** @dev Deposit a bet into the game. Players must deposit their bets to proceed with adding ships
      *      if the game has a bet amount > 0. If players send more than the bet amount, the remainder
      *      is sent to the PullPayments contract for users to withdraw. If players send less than the
      *      bet amount, they can call the depositBet function again to add more deposit.
      * @return The deposit placed (after sending back the change).
      */
    function depositBet() public payable onlyPlayers returns (uint) {
        require(gameState == GameState.Created || gameState == GameState.PlayersJoined, "Game must not have started");
        uint deposit = players[msg.sender].deposit;
        uint refund = 0;
        deposit = deposit.add(msg.value);
        if (deposit > betAmount) {
            refund = deposit.sub(betAmount);
            asyncTransfer(msg.sender, refund);
        }
        players[msg.sender].deposit = deposit;
        emit DepositMade(msg.sender, msg.value, refund);
        return players[msg.sender].deposit;
    }

    /** @dev Gets the deposit amount placed by the player
      * @param player The address of a player to get the opponent of
      * @return Address of the opponent
      */
    function getDepositForPlayer(address player) public view returns (uint) {
        return players[player].deposit;
    }

    // ****************
    // * Submit Ships *
    // ****************
    // The following functions are for submitting the ship "commits" to the blockchain.
    // The first player can do so before the second player joins.
    // Once the player's ships have been submitted, we don't let the player submit again.
    // When both players have submitted their ships, the game moves to "Started" state.

    /** @dev Submits the hashed position information of a particular ship (called HiddenShip) to store on the blockchain.
      *      The function detects when both players have submitted all their ships and changes the game state to Started
      * @param shipNumber The array index of boardShips that corresponds to the ship to store
      * @param commitHash The hashed position information (see calculateCommitHash function)
      */
    function submitHiddenShip(uint shipNumber, bytes32 commitHash) public onlyPlayers {
        require(gameState == GameState.Created || gameState == GameState.PlayersJoined, "Game must not have started");
        require(betAmount == 0 || players[msg.sender].deposit >= betAmount, "Can only place ships if game is a no-bet game or bet has been placed");
        require(shipNumber >=0 && shipNumber < shipsPerPlayer, "Ship number must be in range");
        require(getHiddenShipsCountForPlayer(msg.sender) < shipsPerPlayer, "Cannot resubmit if all ships submitted");

        players[msg.sender].hiddenShips[shipNumber] = commitHash;
        emit ShipAdded(msg.sender, shipNumber);

        if (checkAllHiddenShipsSubmitted()) {
            gameState = GameState.Started;
            startedAt = getTimestamp();
            emit StateChanged(msg.sender, gameState);
        }        
    }

    /** @dev Submits the hashed ship positions (the commit for the ship positions - HiddenShips) in a batch
      * @param commitHashes An array of the hashes for the ship commits. 
      *        Index 0 = ship 0, index 1 = ship 1, etc. following the order in boardShips
      */
    function submitHiddenShipsPacked(bytes32[shipsPerPlayer] commitHashes) public onlyPlayers {
        for (uint i = 0; i < shipsPerPlayer; i++) {
            submitHiddenShip(i, commitHashes[i]);
        }
    }
    
    /** @dev Gets the hashed ship positions in an array
      * @param player The address of a player to get the hashed ship positions of
      * @return Array of hashes (each hash matches a ship position in the order in boardShips)
      */
    function getHiddenShipsPackedForPlayer(address player) public view returns (bytes32[shipsPerPlayer]) {
        return players[player].hiddenShips;
    }

    /** @dev Gets the number of hashed ship positions submitted by a player so far
      * @param player The address of a player
      * @return Number of hashed ship positions submitted
      */
    function getHiddenShipsCountForPlayer(address player) public view returns (uint) {
        uint shipsSubmitted = 0;
        for (uint i = 0; i < shipsPerPlayer; i++) {
            if (players[player].hiddenShips[i] != "") {
                shipsSubmitted++;
            }
        }
        return shipsSubmitted;
    }

    /** @dev Checks all hashed ship positions submitted 
      * @return True if all hashed ship positions submitted, false otherwise
      */
    function checkAllHiddenShipsSubmitted() public view returns (bool) {
        if (getHiddenShipsCountForPlayer(player1) >= shipsPerPlayer && getHiddenShipsCountForPlayer(player2) >= shipsPerPlayer) {
            return true;
        } else {
            return false;
        }
    }

    // **********************
    // * Make shots (moves) *
    // **********************
    // The following functions are making shots. Each player will take turns to make shots.
    // Also, before making a shot, the player must update the status of the opponent's previous shot.
    // Shots are called moves here...

    /** @dev Gets whose turn it is right now
      *      When game starts, both players have 0 moves: player 1 starts first
      *      Then player 2 has less moves than player 1, so it is player 2's turn
      *      Then both players have the same number of moves again, so it is player 1's turn
      * @return Address of the player for which it is his/her turn
      */
    function getWhoseTurn() public view returns (address) {
        if (players[player1].movesCount == players[player2].movesCount) {
            return player1;
        } else {
            return player2;
        }
    }
    
    /** @dev Make a shot
      *      Note: if this is not the first move, you must update the outcome of the last move first
      * @param x The x-coordinate of the shot (coordinates are 0-indexed from top left)
      * @param y The y-coordinate of the shot (coordinates are 0-indexed from top left)
      */
    function makeMove(uint x, uint y) public onlyPlayers {
        require(gameState == GameState.Started || gameState == GameState.Finished, "Game must be started");
        require(x >= 0 && x < boardWidth, "X must be in board");
        require(y >= 0 && y < boardHeight, "Y must be in board");
        
        // Check that it is the player's turn
        require(msg.sender == getWhoseTurn(), "Must be player's turn");
        // Check that player has already submitted move result for previous opponent move
        require(
            (msg.sender == player1 && players[player1].movesCount == 0) ||
            (msg.sender == player1 && players[player2].moves[players[player2].movesCount - 1].result != MoveResult.Unknown) || 
            (msg.sender == player2 && players[player1].moves[players[player1].movesCount - 1].result != MoveResult.Unknown),
            "Must have submitted move result"
        );
        
        players[msg.sender].moves[players[msg.sender].movesCount] = Move(x, y, MoveResult.Unknown, 0);
        players[msg.sender].movesCount++;

        lastMoveAt = getTimestamp();

        emit MoveMade(msg.sender, x, y);
    }

    /** @dev Gets the moves made so far by a player
      *      The return values match the Ship struct but you can't return array of structs
      *      Hence the struct has been deconstructed to 4 arrays here
      * @param player The address of a player
      * @return x Array of the x-coordinate of each move
      * @return y Array of the y-coordinate of each move
      * @return result Array of the result/outcome (hit or miss) of each move
      * @return shipNumber Array of ship numbers (the index in boardShips) if the move was a hit
      */
    function getPlayerMovesPacked(address player) public view returns (uint[boardWidth * boardHeight], uint[boardWidth * boardHeight], MoveResult[boardWidth * boardHeight], uint[boardWidth * boardHeight]) {
        uint[boardWidth * boardHeight] memory movesX;
        uint[boardWidth * boardHeight] memory movesY;
        MoveResult[boardWidth * boardHeight] memory movesResult;
        uint[boardWidth * boardHeight] memory movesShipNumber;
        for (uint i = 0; i < getPlayerMovesCount(player); i++) {
            Move storage move = players[player].moves[i];
            movesX[i] = move.x;
            movesY[i] = move.y;
            movesResult[i] = move.result;
            movesShipNumber[i] = move.shipNumber;
        }
        return (movesX, movesY, movesResult, movesShipNumber);
    }

    /** @dev Gets the number of moves made by a player so far
      * @param player The address of a player
      * @return Number of moves made so far
      */
    function getPlayerMovesCount(address player) public view returns (uint) {
        return players[player].movesCount;
    }

    /** @dev Gets a particular move made by a player
      * @param player The address of a player
      * @param index The move number (starting with 0) of the player
      * @return x The x-coordinate of the move
      * @return y The y-coordinate of the move
      * @return result The result/outcome (hit or miss) of the move
      * @return shipNumber The ship number (the index in boardShips) if the move was a hit
      */
    function getPlayerMove(address player, uint index) public view returns (uint, uint, MoveResult, uint) {
        Move storage move = players[player].moves[index];
        return (move.x, move.y, move.result, move.shipNumber);
    }
    
    /** @dev Updates the result of opponent's last move
      * @param result The result/outcome (hit/miss) of the opponent's last move
      * @param shipNumber If it was a hit, the number (index in boardShips) of the ship that was hit
      */
    function updateLastOpponentMoveWithResult(MoveResult result, uint shipNumber) public onlyPlayers {
        require(gameState == GameState.Started, "Game must be started");
        require(result == MoveResult.Hit || result == MoveResult.Miss, "Result must be Hit or Miss, not unknown");
        require(result == MoveResult.Miss || (shipNumber >= 0 && shipNumber < shipsPerPlayer), "Result must be miss or shipnumber");
        
        address opponent = getOpponentAddressForPlayer(msg.sender);
        uint opponentMoveCount = players[opponent].movesCount;
        //require(players[opponent].moves[opponentMoveCount - 1].result == MoveResult.Unknown);

        players[opponent].moves[opponentMoveCount - 1].result = result;
        if (result == MoveResult.Hit) {
            players[opponent].moves[opponentMoveCount - 1].shipNumber = shipNumber;
        }

        emit MoveUpdated(msg.sender, result, shipNumber);
    }

    /** @dev Updates the result of opponent's last move, and then make a move
      *      Because both have to be done most of the time, this is a convenience function to do both together
      * @param x The x-coordinate of the shot (coordinates are 0-indexed from top left)
      * @param y The y-coordinate of the shot (coordinates are 0-indexed from top left)
      * @param result The result/outcome (hit/miss) of the opponent's last move
      * @param shipNumber If it was a hit, the number (index in boardShips) of the ship that was hit
      */
    function makeMoveAndUpdateLastMoveWithResult(uint x, uint y, MoveResult result, uint shipNumber) public onlyPlayers {
        emit Logs(msg.sender, "Updating last opponent move 2");
        updateLastOpponentMoveWithResult(result, shipNumber);
        emit Logs(msg.sender, "Make move 2");
        makeMove(x, y);
    }

    /** @dev Gets the number of hits made by a player so far
      * @param player The address of a player
      * @return Number of hits made so far
      */
    function getHitCountForPlayer(address player) public view returns (uint) {
        uint hitCount = 0;
        for(uint i = 0; i < players[player].movesCount; i++) {
            if (players[player].moves[i].result == MoveResult.Hit) {
                hitCount++;
            }
        }
        return hitCount;
    }

    // *****************
    // * Game Finished *
    // *****************
    // When a player thinks he/she has won (because his/her number of hits >= shipSpaces),
    // or when a player thinks he/she has lost (because all of his/her ships have sunk),
    // the player can call the function below to move the game to "finished" state.
    //
    // If players forget to call the function immediately, they can still call the function later.
    // The winner will still be the first player who sinks the ships of the opponent 
    // (based on the moves history).
        
    /** @dev Lets a player declare a game finished (when the number of squares hit >= sum of the ships)
      *      This function exists to minimize checking the conditions on every move
      *      Instead, the UI can do the computation and then only call this function to confirm
      */
    function tryToDeclareGameFinished() public onlyPlayers {
        require(gameState == GameState.Started);
        // can only declare game finished if one player's hitCount >= shipSpaces
        require(getHitCountForPlayer(player1) >= shipSpaces || getHitCountForPlayer(player2) >= shipSpaces);
        gameState = GameState.Finished;
        finishedAt = getTimestamp();
        emit StateChanged(msg.sender, gameState);
    }

    // ****************
    // * Reveal Ships *
    // ****************
    // Once the game is "finished", both players will be asked to reveal their ships.
    // This is used to check that all the ships match the initial commit.
    // Once both players have revealed their ships, the game moves to the "ShipsRevealed" stage.
    
    /** @dev Reveal a particular ship to the blockchain
      *      The hash of the ship's information must match that in the commit earlier (submitHiddenShip function)
      * @param shipNumber The number (index in boardShips) of the ship to reveal
      * @param width The width of the ship
      * @param height The height of the ship 
      *               (while this function does not check, technically the width or height must be 1)
      * @param x The x-coordinate of the topleft most square of the ship (coordinates are 0-indexed from top left)
      * @param y The y-coordinate of the topleft most square of the ship (coordinates are 0-indexed from top left)
      * @param nonce The nonce used when generating the commit hash earlier
      */
    function revealShip(uint shipNumber, uint width, uint height, uint x, uint y, bytes32 nonce) public onlyPlayers {
        require(shipNumber >= 0 && shipNumber < shipsPerPlayer, "Ship number must be within range");
        require(width == 1 || height == 1, "Width or height must be 1, the ship cannot be wider");
        require(x.add(width) < boardWidth, "X coordinate cannot place ship outside of board");
        require(y.add(height) < boardHeight, "Y coordinate cannot place ship outside of board");
        require(
            (boardShips[shipNumber] == width && height == 1) || (boardShips[shipNumber] == height && width == 1), 
            "Ship width/height must match for the ship (ref by shipNumber)"
        );
        
        bytes32 calculatedCommitHash = keccak256(abi.encodePacked(width, height, x, y, nonce));
        require(calculatedCommitHash == players[msg.sender].hiddenShips[shipNumber], "Ship reveal hash mismatch");

        players[msg.sender].revealShips[shipNumber] = Ship(width, height, x, y);

        if (checkAllShipsRevealed()) {
            gameState = GameState.ShipsRevealed;
            emit StateChanged(msg.sender, gameState);
        }
    }

    /** @dev Reveal all the ships' positions to the blockchain in batch
      *      The hash of each ship's information must match that in the commit earlier (submitHiddenShip function)
      * @param width Array of the the width of each ship
      * @param height Array of the height of each ship (the width or height must be 1)
      * @param x Array of the x-coordinate of the topleft most square of each ship (coordinates are 0-indexed from top left)
      * @param y Array of the y-coordinate of the topleft most square of each ship (coordinates are 0-indexed from top left)
      * @param nonce Array of the nonce used when generating the commit hash earlier
      * @return Number of moves made so far
      */
    function revealShipsPacked(uint[shipsPerPlayer] width, uint[shipsPerPlayer] height, uint[shipsPerPlayer] x, uint[shipsPerPlayer] y, bytes32[shipsPerPlayer] nonce) public onlyPlayers {
        for (uint i = 0; i < shipsPerPlayer; i++) {
            revealShip(i, width[i], height[i], x[i], y[i], nonce[i]);
        }
    }

    /** @dev Gets a number of ships revealed by a player so far
      * @param player The address of a player
      * @return The number of ships revealed
      */
    function getRevealShipsCountForPlayer(address player) public view returns (uint) {
        uint playerShipsCount;
        for (uint i = 0; i < shipsPerPlayer; i++) {
            // We only check the width and height, as x, y are allowed to be zero
            if (players[player].revealShips[i].width != 0 && players[player].revealShips[i].height != 0) {
                playerShipsCount++;
            }
        }
        return playerShipsCount;
    }
    
    /** @dev Gets the ships revealed so far in deconstructed array form
      * @param player The address of a player
      * @return width Array of the width of the ships
      * @return height Array of the height of the ships
      * @return x Array of the x-coordinate of the ships
      * @return y Array of the y-coordinate of the ships
      */
    function getRevealShipsPackedForPlayer(address player) public view returns (uint[shipsPerPlayer], uint[shipsPerPlayer], uint[shipsPerPlayer], uint[shipsPerPlayer]) {
        uint[shipsPerPlayer] memory width;
        uint[shipsPerPlayer] memory height;
        uint[shipsPerPlayer] memory x;
        uint[shipsPerPlayer] memory y;
        for (uint i = 0; i < shipsPerPlayer; i++) {
            Ship memory ship = players[player].revealShips[i];
            width[i] = ship.width;
            height[i] = ship.height;
            x[i] = ship.x;
            y[i] = ship.y;
        }
        return (width, height, x, y);
    }

    /** @dev Checks that a player has revealed all his/her ships
      * @param player The address of a player
      * @return True if all revealed, false otherwise
      */
    function checkPlayerShipsRevealed(address player) public view returns (bool) {
        return getRevealShipsCountForPlayer(player) >= shipsPerPlayer;
    }

    /** @dev Checks if both players have revealed their ships
      * @return True if both players have revealed, false otherwise
      */
    function checkAllShipsRevealed() public view returns (bool) {
        return (checkPlayerShipsRevealed(player1) && checkPlayerShipsRevealed(player2));
    }

    /** @dev Checks that a player's ships placements (after revealing) are sane
      *      This involves checking that they do not overlap and are within the game board
      * @param player The address of a player
      * @return True if the placement of ships is sane, false otherwise
      */
    function isShipPlacementSaneForPlayer(address player) public view returns (bool) {
        uint[boardWidth][boardHeight] memory board;

        for (uint shipIndex = 0; shipIndex < shipsPerPlayer; shipIndex++) {
            // For all the ships that have been revealed so far
            Ship storage ship = players[player].revealShips[shipIndex];
            
            if (ship.width != 0 && ship.height != 0) {
                
                uint x = ship.x;
                uint y = ship.y;
                uint width = ship.width;
                uint height = ship.height;

                if (x + width >= boardWidth) return false;
                if (y + height >= boardHeight) return false;

                for (uint i = x; i < x + width; i++) {
                    for (uint j = y; j < y + height; j++) {
                        if (board[i][j] != 0) return false;
                        board[i][j] = shipIndex + 1; // we plus 1 here, so that zero = empty ship
                    }
                }
            }
        }

        return true;
    }

    // *****************
    // * Conclude Game *
    // *****************
    // Once both players have revealed their ships (or there has been some timeout),
    // a player can request to end the game.
    //
    // The functions below will then check that:
    // 1) Players' ships are placed in valid positions
    // 2) Players have reported the correct outcome of each move to their opponent.
    //
    // If the above conditions are true, the player who sinks all the opponent's ships first wins.
    // If either of these fails, the player who did not "cheat" is the winner. 

    /** @dev Checks that the player has reported (for the opponent's moves) the correct outcome of each move
      * @param player The player to check for
      */
    function isMovesReportedCorrectlyForPlayer(address player) public view returns (bool) {
        uint[boardWidth][boardHeight] memory board;

        // Place all the ships down on a board
        for (uint shipIndex = 0; shipIndex < shipsPerPlayer; shipIndex++) {
            // For all the ships that have been revealed so far
            Ship storage ship = players[player].revealShips[shipIndex];
            
            if (ship.width != 0 && ship.height != 0) {

                if (ship.x + ship.width >= boardWidth) return false;
                if (ship.y + ship.height >= boardHeight) return false;

                for (uint i = ship.x; i < ship.x + ship.width; i++) {
                    for (uint j = ship.y; j < ship.y + ship.height; j++) {
                        board[i][j] = shipIndex + 1; // we plus 1 here, so that zero = empty ship
                    }
                }
            }
        }

        address opponent = getOpponentAddressForPlayer(player);
        Move[boardWidth * boardHeight] storage opponentMoves = players[opponent].moves;
        uint opponentMoveCount = players[opponent].movesCount;

        for (uint moveNum = 0; moveNum < opponentMoveCount; moveNum++) {
            Move storage move = opponentMoves[moveNum];
            if (board[move.x][move.y] == 0 && move.result == MoveResult.Miss) {
                // ok
            } else if (board[move.x][move.y] != 0 && move.result == MoveResult.Hit && move.shipNumber + 1 == board[move.x][move.y]) {
                // ok
            } else if (move.result == MoveResult.Unknown) {
                // ok
            } else {
                return false;
            }
        }

        return true;

    }

    /** @dev Lets a player declare a game timeout (too long since the game was created/started/last move/finished)
      *      or (if both ships have been revealed) to determine the winner.
      *      
      *      In the event that a timeout occurs, the logic tries to determine whose "fault" it is:
      *      - before the first shot is made, any timeout results in a draw
      *      - after the first shot is made but before any player has enough hits to win (finished state), any timeout results 
      *        in the player of the last move winning (because the current turn's player is not making shots fast enough)
      *      - after that, both players have to reveal their ships. If both do not reveal, it is a draw. If only one player
      *        reveals in the time limit, the player wins.
      *      - if both players have revealed their ships, the game checks for cheating/misreporting 
      *        (see function checkWinnerWhenBothPlayersRevealedShips)
      *
      *      Currently each time limit is set to 24 hours which should be plenty for players to add their ships,
      *      make the next shot, reveal his/her ships, etc.
      */
    function tryToDeclareGameTimeoutOrEnded() public onlyPlayers {
        if (gameState == GameState.Created || gameState == GameState.PlayersJoined) {
            require (getTimestamp() > createdAt.add(24 * 60 * 60), "Game must have taken too long since created state to end");
            gameState = GameState.Ended;
            gameEndState = GameEndState.Draw;
            emit StateChanged(msg.sender, gameState);
            processWinnings();
        } else if (gameState == GameState.Started) {
            if (lastMoveAt == 0) { // both players have not started yet
                require (getTimestamp() > startedAt.add(24 * 60 * 60), "Game must have taken too long since started state to end"); // 24 hours since the game entered started state
                gameState = GameState.Ended;
                gameEndState = GameEndState.Draw;
                emit StateChanged(msg.sender, gameState);
                processWinnings();
            } else { // first move has been placed
                require(getTimestamp() > lastMoveAt.add(24 * 60 * 60), "Game must have taken too long since last move to end"); // 24 hours since the last move
                gameState = GameState.Ended;
                // since the player whose turn refuses to make the move, we award the opponent to be the winner
                if (getWhoseTurn() == player1) {
                    gameEndState = GameEndState.Player2WinsInvalidGame;
                } else {
                    gameEndState = GameEndState.Player1WinsInvalidGame;
                }
            }
        } else if (gameState == GameState.Finished) { // not GameState.ShipsRevealed
            require(getTimestamp() > finishedAt.add(24 * 60 * 60), "Game must have taken too long since finish declared to end");
            gameState = GameState.Ended;

            bool player1ShipsRevealed = checkPlayerShipsRevealed(player1);
            bool player2ShipsRevealed = checkPlayerShipsRevealed(player2);
            if (player1ShipsRevealed && player2ShipsRevealed) {
                // Should not happen as game should auto-move to ShipsRevealed status
                checkAllShipsRevealed();
            } else if (player1ShipsRevealed && !player2ShipsRevealed) {
                gameState = GameState.Ended;
                gameEndState = GameEndState.Player1WinsInvalidGame;
            } else if (!player1ShipsRevealed && player2ShipsRevealed) {
                gameState = GameState.Ended;
                gameEndState = GameEndState.Player2WinsInvalidGame;
            } else {
                gameState = GameState.Ended;
                gameEndState = GameEndState.Draw;
            }
            emit StateChanged(msg.sender, gameState);
            processWinnings();
        } else if (gameState == GameState.ShipsRevealed) {
            gameEndState = checkWinnerWhenBothPlayersRevealedShips();
            gameState = GameState.Ended;
            emit StateChanged(msg.sender, gameState);
            processWinnings();
        } else {
            // Game has ended, do nothing
            require(false, "Game has ended, so nothing to do");
        }
    }

    /** @dev Determines the game's winner if both players have revealed their ships
      *      
      *      The logic checks that players did not overlap their ships or place them outside the board
      *      (see isShipPlacementSaneForPlayer) and checks that each player reported the outcome of 
      *      his/her opponent's shots correctly.
      *      
      *      If one of these is not satisfied, the other player wins.
      *      
      *      If both are satisfied, the winner is the one to sink the opponent's ships in the fewest moves.
      *      (if both players took the same number of moves, player 1 wins because player 1 starts first)
      *      
      *      Note that this win is treated differently from the earlier player wins because the opponent
      *      cheated/did not continue to play. This is so that we can refund the loser a small amount in a
      *      far win to incentivise players to play to the end even if they are losing.
      */
    function checkWinnerWhenBothPlayersRevealedShips() public view returns (GameEndState) {
        require(gameState == GameState.ShipsRevealed, "Function can only be called when both players already revealed ships");

        // Check both players have valid ship placement
        bool player1ShipsPlacementValid = isShipPlacementSaneForPlayer(player1);
        bool player2ShipsPlacementValid = isShipPlacementSaneForPlayer(player2);
        if (player1ShipsPlacementValid && player2ShipsPlacementValid) {
            // continue checks
        } else if (player1ShipsPlacementValid && !player2ShipsPlacementValid) {
            return GameEndState.Player1WinsInvalidGame;
        } else if (!player1ShipsPlacementValid && player2ShipsPlacementValid) {
            return GameEndState.Player2WinsInvalidGame;
        } else {
            return GameEndState.Draw;
        }

        // Check both players have reported their ships correctly
        bool player1MovesReportedCorrectly = isMovesReportedCorrectlyForPlayer(player1);
        bool player2MovesReportedCorrectly = isMovesReportedCorrectlyForPlayer(player2);
        if (player1MovesReportedCorrectly && player2MovesReportedCorrectly) {
            // continue checks
        } else if (player1MovesReportedCorrectly && !player2MovesReportedCorrectly) {
            return GameEndState.Player1WinsInvalidGame;
        } else if (!player1MovesReportedCorrectly && player2MovesReportedCorrectly) {
            return GameEndState.Player2WinsInvalidGame;
        } else {
            return GameEndState.Draw;
        }

        // Check which player sunk all ships first
        uint player1Hits = 0;
        uint player2Hits = 0;
        for (uint i = 0; i < boardWidth * boardHeight; i++) {
            if (players[player1].moves[i].result == MoveResult.Hit) {
                player1Hits++;
                if (player1Hits >= shipSpaces) {
                    return GameEndState.Player1WinsValidGame;
                }
            }

            if (players[player2].moves[i].result == MoveResult.Hit) {
                player2Hits++;
                if (player2Hits >= shipSpaces) {
                    return GameEndState.Player2WinsValidGame;
                }
            }
        }

    }

    /** @dev Processes the winnings based on the game end state set in other functions
      *      
      *      This function transfers the winnings/refunds to the PullPayments contract for players to
      *      withdraw. Internally that uses an escrow contract.
      
      *      Note that in order to incentivise players to play to the end even if they are losing, 
      *      we return the loser 20% of their bet (but nothing if they stop playing or cheat).
      *      The winner gets 180% of their bet if they win at the end.
      *
      *      This is not a bug!
      */
    function processWinnings() internal {
        require(winningsProcessed == false, "Can only process winnings once");
        require(gameState == GameState.Ended, "Game must have ended");
        require(gameEndState != GameEndState.Unknown, "The game end state must not be unknown");

        // We use the totalPrize as the sum of deposits rather than betAmount * 2
        // This is to avoid issues with the logic when a refund is given with only one player
        uint totalPrize = players[player1].deposit + players[player2].deposit;
        uint losingPrize = totalPrize.div(10); 
        // because division rounds down, we calculate the losing prize first
        // this is so that the winning prize will always be the "rounded up" portion and be bigger 
        // than the losing prize if the bet amounts are really small
        uint winningPrize = totalPrize.sub(losingPrize);       

        if (gameEndState == GameEndState.Draw) {
            // If draw, we refund users their deposit, rather than the betAmount
            // This is to handle where there is only 1 player who joined and/or
            // only 1 player has placed bet
            if (player1 != 0) {
                asyncTransfer(player1, players[player1].deposit);
                emit PaidToEscrow(player1, players[player1].deposit);
            }
            if (player2 != 0) {
                asyncTransfer(player2, players[player2].deposit);            
                emit PaidToEscrow(player2, players[player2].deposit);
            }
        } else if (gameEndState == GameEndState.Player1WinsInvalidGame) {
            asyncTransfer(player1, totalPrize);
            emit PaidToEscrow(player1, totalPrize);
        } else if (gameEndState == GameEndState.Player2WinsInvalidGame) {
            asyncTransfer(player2, totalPrize);
            emit PaidToEscrow(player2, totalPrize);
        } else if (gameEndState == GameEndState.Player1WinsValidGame) {
            asyncTransfer(player1, winningPrize);
            asyncTransfer(player2, losingPrize);
            emit PaidToEscrow(player1, winningPrize);
            emit PaidToEscrow(player2, losingPrize);
        } else if (gameEndState == GameEndState.Player2WinsValidGame) {
            asyncTransfer(player1, losingPrize);
            asyncTransfer(player2, winningPrize);
            emit PaidToEscrow(player1, losingPrize);
            emit PaidToEscrow(player2, winningPrize);
        }
    }
    
}