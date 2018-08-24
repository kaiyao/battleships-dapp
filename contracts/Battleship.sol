pragma solidity ^0.4.23;

import "../installed_contracts/zeppelin/contracts/ownership/Ownable.sol";
import "../installed_contracts/zeppelin/contracts/lifecycle/Pausable.sol";
import "../installed_contracts/zeppelin/contracts/payment/PullPayment.sol";

contract Battleship is Ownable, Pausable, PullPayment {
    
    // Configure the game settings here
    uint public constant boardWidth = 10;
    uint public constant boardHeight = 10;
    uint constant shipsPerPlayer = 5;
    uint[shipsPerPlayer] public boardShips = [5, 4, 3, 3, 2];    
    uint constant shipSpaces = 5 + 4 + 3 + 3 + 2;
    
    struct Ship {
        uint width;
        uint height;
        uint x;
        uint y;
    }

    struct ShipHidden {
        bytes32 commitHash;
        bytes32 commitNonceHash;
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
        address player;
        Ship[shipsPerPlayer] revealShips;
        uint revealShipsCount;
        ShipHidden[shipsPerPlayer] hiddenShips;
        uint hiddenShipsCount;
        Move[boardWidth * boardHeight] moves;
        uint movesCount;
        uint hitCount;
        uint[shipsPerPlayer] perShipHitCount;
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

    enum GameEndState { Draw, Player1WinsValidGame, Player2WinsValidGame, Player1WinsInvalidGame, Player2WinsInvalidGame }

    // game must start within time limit of creation otherwise refund
    uint createdAt;
    // game must finish within time limit of starting otherwise refund
    // game finish => sunk squares of 1 player == number of squares of ships
    uint startedAt;
    // players must reveal ships within time limit of finishing
    uint finishedAt;
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
    
    mapping (address => PlayerInfo) public players;
    uint playerCount;

    bool public testMode;
    uint public testModeTimestamp;

    event StateChanged (
        address indexed _from,
        GameState newState
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
    
    constructor() public {    
        gameState = GameState.Created;
        createdAt = getTimestamp();
    }

    function getTimestamp() public view returns (uint) {
        if (testMode) {
            return testModeTimestamp;
        } else {
            return block.timestamp;
        }
    }

    function getBoardShips() public view returns (uint[shipsPerPlayer]) {
        return boardShips;
    }

    function joinPlayer(address newPlayer) public {
        require(gameState == GameState.Created);
        require(newPlayer != player1 && newPlayer != player2);
        players[newPlayer].player = newPlayer;

        if (player1 == 0) {
            player1 = newPlayer;
        } else {            
            player2 = newPlayer;
        }

        playerCount++;
        if (playerCount == 2) {
            gameState = GameState.PlayersJoined;
            emit StateChanged(msg.sender, gameState);
        }
    } 
    
    function joinMyself() public {
        joinPlayer(msg.sender);
    }

    function getOpponentAddress() public view returns (address) {
        require(msg.sender == player1 || msg.sender == player2);
        require(player1 != 0 && player2 != 0);
        return getOpponentAddressForPlayer(msg.sender);
    }

    function getOpponentAddressForPlayer(address player) public view returns (address) {
        if (player1 == player) {
            return player2;
        } else {            
            return player1;
        }
    }

    function calculateCommitHash(uint width, uint height, uint x, uint y, bytes32 nonce) public pure returns (bytes32) {
        bytes32 calculatedCommitHash = keccak256(abi.encodePacked(width, height, x, y, nonce));
        return calculatedCommitHash;
    }

    function calculateCommitNonceHash(bytes32 nonce) public pure returns (bytes32) {
        bytes32 calculatedCommitNonceHash = keccak256(abi.encodePacked(nonce));
        return calculatedCommitNonceHash;
    }

    function submitHiddenShip(uint shipNumber, bytes32 commitHash, bytes32 commitNonceHash) public {
        require(gameState == GameState.Created || gameState == GameState.PlayersJoined);
        require(shipNumber >=0 && shipNumber < shipsPerPlayer);
        require(msg.sender == player1 || msg.sender == player2);

        players[msg.sender].hiddenShips[shipNumber] = ShipHidden(commitHash, commitNonceHash);
        if (checkAllHiddenShipsSubmitted()) {
            gameState = GameState.Started;
            startedAt = getTimestamp();
            emit StateChanged(msg.sender, gameState);
        }        
    }

    /** @dev Submits hidden ships (the commit for the ship positions) in a batch
      * @param commitHashes An array of the hashes for the ship commits. Index 0 = ship 0, index 1 = ship 1, etc.
      * @param commitNonceHashes An array of the hash of the nonces
      */
    function submitHiddenShipsPacked(bytes32[shipsPerPlayer] commitHashes, bytes32[shipsPerPlayer] commitNonceHashes) public {
        for (uint i = 0; i < shipsPerPlayer; i++) {
            bytes32 commitHash = commitHashes[i];
            bytes32 commitNonceHash = commitNonceHashes[i];
            submitHiddenShip(i, commitHash, commitNonceHash);
        }
    }
    
    function getHiddenShipsPacked() public view returns (bytes32[shipsPerPlayer], bytes32[shipsPerPlayer]) {
        bytes32[shipsPerPlayer] memory commitHashes;
        bytes32[shipsPerPlayer] memory commitNonceHashes;
        for (uint i = 0; i < shipsPerPlayer; i++) {
            ShipHidden storage ship = players[msg.sender].hiddenShips[i];
            commitHashes[i] = ship.commitHash;
            commitNonceHashes[i] = ship.commitNonceHash;
        }
        return (commitHashes, commitNonceHashes);
    }

    function checkAllHiddenShipsSubmitted() private view returns (bool) {
        uint player1Ships = 0;
        uint player2Ships = 0;
        for (uint i = 0; i < shipsPerPlayer; i++) {
            if (players[player1].hiddenShips[i].commitHash != "" && players[player1].hiddenShips[i].commitNonceHash != "") {
                player1Ships++;
            }
            if (players[player2].hiddenShips[i].commitHash != "" && players[player2].hiddenShips[i].commitNonceHash != "") {
                player2Ships++;
            }
        }
        if (player1Ships >= shipsPerPlayer && player2Ships >= shipsPerPlayer) {
            return true;
        } else {
            return false;
        }
    }

    // Check whose turn it is 
    // When game starts, both players have 0 moves: player 1 starts first
    // Then player 2 has less moves than player 1, so it is player 2's turn
    // Then both players have the same number of moves again, so it is player 1's turn
    function getWhoseTurn() public view returns (address) {
        if (players[player1].movesCount == players[player2].movesCount) {
            return player1;
        } else {
            return player2;
        }
    }
    
    function makeMove(uint x, uint y) public {
        require(gameState == GameState.Started, "Game must be started");
        require(msg.sender == player1 || msg.sender == player2, "Sender must be player");
        
        // Check that it is the player's turn
        require(msg.sender == getWhoseTurn(), "Must be player's turn");
        // Check that player has already submitted move result for previous opponent move
        require(
            (msg.sender == player1 && players[player1].movesCount == 0) ||
            (msg.sender == player1 && players[player2].moves[players[player2].movesCount - 1].result != MoveResult.Unknown) || 
            (msg.sender == player2 && players[player1].moves[players[player1].movesCount - 1].result != MoveResult.Unknown),
            "Must have submitted move result"
        );
        // Check that player has already revealed ship if a ship has been hit
        require(checkAllSunkShipsRevealed(), "player must reveal ship if hit");
        
        players[msg.sender].moves[players[msg.sender].movesCount] = Move(x, y, MoveResult.Unknown, 0);
        players[msg.sender].movesCount++;

        emit MoveMade(msg.sender, x, y);
    }

    // Checks that all the ships that the opponent has hit and sunk the player with, the player has revealed them
    function checkAllSunkShipsRevealed() public view returns (bool) {
        address player = msg.sender;
        address opponent = getOpponentAddress();
        for (uint shipNumber = 0; shipNumber < shipsPerPlayer; shipNumber++) {
            if (players[opponent].perShipHitCount[shipNumber] >= boardShips[shipNumber]) {
                // Ship has been sunk
                if (players[player].revealShips[shipNumber].width != 0 && players[player].revealShips[shipNumber].height != 0) {
                    // okay, ship has been revealed
                } else {
                    return false;
                }
            }
        }
        return true;
    }

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

    function getPlayerMovesCount(address player) public view returns (uint) {
        return players[player].movesCount;
    }

    function getPlayerMove(address player, uint index) public view returns (uint, uint, MoveResult, uint) {
        Move storage move = players[player].moves[index];
        return (move.x, move.y, move.result, move.shipNumber);
    }
    
    function updateLastOpponentMoveWithResult(MoveResult result, uint shipNumber) public {
        require(gameState == GameState.Started, "Game must be started");
        require(msg.sender == player1 || msg.sender == player2, "Sender must be player");
        require(result == MoveResult.Hit || result == MoveResult.Miss, "Result must be Hit or Miss, not unknown");
        require(result == MoveResult.Miss || (shipNumber >= 0 && shipNumber < shipsPerPlayer), "Result must be miss or shipnumber");
        
        address opponent = getOpponentAddress();
        uint opponentMoveCount = players[opponent].movesCount;
        //require(players[opponent].moves[opponentMoveCount - 1].result == MoveResult.Unknown);

        players[opponent].moves[opponentMoveCount - 1].result = result;
        if (result == MoveResult.Hit) {
            players[opponent].moves[opponentMoveCount - 1].shipNumber = shipNumber;
            players[opponent].hitCount++;
            players[opponent].perShipHitCount[shipNumber]++;
        }

        emit MoveUpdated(msg.sender, result, shipNumber);

        /*if (players[opponent].hitCount >= shipSpaces) {
            // opponent has won!
            setGameEnd();
        }*/
    }

    function makeMoveAndUpdateLastMoveWithResult(uint x, uint y, MoveResult result, uint shipNumber) public {
        updateLastOpponentMoveWithResult(result, shipNumber);
        makeMove(x, y);
    }

    function makeMoveAndUpdateLastMoveWithResultAndRevealShip(uint x, uint y, MoveResult result, uint shipNumber, uint shipWidth, uint shipHeight, uint shipX, uint shipY, bytes32 nonce) public {
        updateLastOpponentMoveWithResult(result, shipNumber);
        revealShip(shipNumber, shipWidth, shipHeight, shipX, shipY, nonce);
        makeMove(x, y);
    }
    
    function revealShip(uint shipNumber, uint width, uint height, uint x, uint y, bytes32 nonce) public {
        require(msg.sender == player1 || msg.sender == player2, "Must be player to reveal ship");
        require(shipNumber >= 0 && shipNumber < shipsPerPlayer, "Ship number must be within range");
        require(width == 1 || height == 1, "Width or height must be 1, the ship cannot be wider");
        require(x + width < boardWidth, "X coordinate cannot place ship outside of board");
        require(y + height < boardHeight, "Y coordinate cannot place ship outside of board");
        require(
            (boardShips[shipNumber] == width && height == 1) || (boardShips[shipNumber] == height && width == 1), 
            "Ship width/height must match for the ship (ref by shipNumber)"
        );
        
        bytes32 calculatedCommitHash = keccak256(abi.encodePacked(width, height, x, y, nonce));
        require(calculatedCommitHash == players[msg.sender].hiddenShips[shipNumber].commitHash, "Ship reveal hash mismatch");

        players[msg.sender].revealShips[shipNumber] = Ship(width, height, x, y);

        require(isShipPlacementSaneForPlayer(msg.sender), "Ship placement is not sane");
    }
        
    function setGameEnd() private {
        require(gameState == GameState.Started);
        require(msg.sender == player1 || msg.sender == player2);
        gameState = GameState.Finished;
        finishedAt = getTimestamp();
        emit StateChanged(msg.sender, gameState);
    }


    function checkAllShipsRevealed() public view returns (bool) {
        return (checkPlayerShipsRevealed(player1) && checkPlayerShipsRevealed(player2));
    }

    function checkPlayerShipsRevealed(address player) public view returns (bool) {
        uint playerShips;
        for (uint i = 0; i < shipsPerPlayer; i++) {
            // We only check the width and height, as x, y are allowed to be zero
            if (players[player].revealShips[i].width != 0 && players[player].revealShips[i].height != 0) {
                playerShips++;
            }
        }
        if (playerShips >= shipsPerPlayer) {
            return true;
        } else {
            return false;
        }
    }

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
    
    function gameFinishedAction() public view returns (address) {
        require(gameState == GameState.Finished, "Game must be finished");
        
        if (getTimestamp() - finishedAt > 24 * 60 * 60) {
            if (checkPlayerShipsRevealed(player1) == false && checkPlayerShipsRevealed(player2) == false) {
                // draw
            } else if (checkPlayerShipsRevealed(player1) == true && checkPlayerShipsRevealed(player2) == false) {
                // player 1 wins because player 2 did not reveal
            } else if (checkPlayerShipsRevealed(player1) == false && checkPlayerShipsRevealed(player2) == true) {
                // player 2 wins because player 1 did not reveal
            } else {
                // both players have revealed (presumably before the time limit is up), so we check for the winner
            }
        } else {
            if (checkPlayerShipsRevealed(player1) == true && checkPlayerShipsRevealed(player2) == true) {
                // both players have revealed, so we check for the winner
            }
        }
    }

    function checkWinnerWhenBothPlayersRevealedShips() public view returns (GameEndState) {

        // Check both players have valid ship placement
        // Skip this because we already check when revealing ship. You cannot reveal a ship successfully if it is invalid
        /*bool player1ShipsPlacementValid = isShipPlacementSaneForPlayer(player1);
        bool player2ShipsPlacementValid = isShipPlacementSaneForPlayer(player2);
        if (player1ShipsPlacementValid && player1ShipsPlacementValid) {
            // continue checks
        } else if (player1ShipsPlacementValid && !player2ShipsPlacementValid) {
            return GameEndState.Player1WinsInvalidGame;
        } else if (!player1ShipsPlacementValid && player2ShipsPlacementValid) {
            return GameEndState.Player2WinsInvalidGame;
        } else {
            return GameEndState.Draw;
        }*/

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
    
}