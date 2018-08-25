pragma solidity ^0.4.23;

import "../node_modules/openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "../node_modules/openzeppelin-solidity/contracts/payment/PullPayment.sol";
import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";

contract Battleship is Ownable, PullPayment {
    using SafeMath for uint256;
    
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
    function emergencyStop() public onlyOwner {
        gameState = GameState.Ended;
        gameEndState = GameEndState.Draw;
        processWinnings();
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

    function getOpponentAddress() public view returns (address) {
        return getOpponentAddressForPlayer(msg.sender);
    }

    function getOpponentAddressForPlayer(address player) public view returns (address) {
        require(player == player1 || player == player2);
        require(player1 != 0 && player2 != 0);
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

    // ******************
    // * Adding Players *
    // ******************
    // The following functions are for adding players to the game.
    // Once both players have been added, the game will move to "PlayersJoined" state.
        
    function joinGame() public {
        joinGameForPlayer(msg.sender);
    }

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

    /** @dev Submits hidden ships (the commit for the ship positions) in a batch
      * @param commitHashes An array of the hashes for the ship commits. Index 0 = ship 0, index 1 = ship 1, etc.
      */
    function submitHiddenShipsPacked(bytes32[shipsPerPlayer] commitHashes) public onlyPlayers {
        for (uint i = 0; i < shipsPerPlayer; i++) {
            submitHiddenShip(i, commitHashes[i]);
        }
    }
    
    function getHiddenShipsPackedForPlayer(address player) public view returns (bytes32[shipsPerPlayer]) {
        return players[player].hiddenShips;
    }

    function getHiddenShipsCountForPlayer(address player) public view returns (uint) {
        uint shipsSubmitted = 0;
        for (uint i = 0; i < shipsPerPlayer; i++) {
            if (players[player].hiddenShips[i] != "") {
                shipsSubmitted++;
            }
        }
        return shipsSubmitted;
    }

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

        emit MoveMade(msg.sender, x, y);
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

    function makeMoveAndUpdateLastMoveWithResult(uint x, uint y, MoveResult result, uint shipNumber) public onlyPlayers {
        emit Logs(msg.sender, "Updating last opponent move 2");
        updateLastOpponentMoveWithResult(result, shipNumber);
        emit Logs(msg.sender, "Make move 2");
        makeMove(x, y);
    }

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

    function revealShipsPacked(uint[shipsPerPlayer] width, uint[shipsPerPlayer] height, uint[shipsPerPlayer] x, uint[shipsPerPlayer] y, bytes32[shipsPerPlayer] nonce) public onlyPlayers {
        for (uint i = 0; i < shipsPerPlayer; i++) {
            revealShip(i, width[i], height[i], x[i], y[i], nonce[i]);
        }
    }

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

    function checkPlayerShipsRevealed(address player) public view returns (bool) {
        return getRevealShipsCountForPlayer(player) >= shipsPerPlayer;
    }

    function checkAllShipsRevealed() public view returns (bool) {
        return (checkPlayerShipsRevealed(player1) && checkPlayerShipsRevealed(player2));
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

    function tryToDeclareGameTimeoutOrEnded() public onlyPlayers {
        if (gameState == GameState.Created || gameState == GameState.PlayersJoined) {
            if (getTimestamp() > createdAt.add(24 * 60 * 60)) {
                gameState = GameState.Ended;
                gameEndState = GameEndState.Draw;
                emit StateChanged(msg.sender, gameState);
                processWinnings();
            }
        } else if (gameState == GameState.Started) {
            if (getTimestamp() > startedAt.add(24 * 60 * 60)) {
                gameState = GameState.Ended;
                gameEndState = GameEndState.Draw;
                emit StateChanged(msg.sender, gameState);
                processWinnings();
            }
        } else if (gameState == GameState.Finished) { // not GameState.ShipsRevealed
            if (getTimestamp() > finishedAt.add(24 * 60 * 60)) {
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
            }
        } else if (gameState == GameState.ShipsRevealed) {
            gameEndState = checkWinnerWhenBothPlayersRevealedShips();
            gameState = GameState.Ended;
            emit StateChanged(msg.sender, gameState);
            processWinnings();
        } else {
            // Game has ended, do nothing
        }
    }

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

    function processWinnings() internal {
        require(winningsProcessed == false, "Can only process winnings once");
        require(gameState == GameState.Ended, "Game must have ended");
        require(gameEndState != GameEndState.Unknown, "The game end state must not be unknown");

        uint totalPrize = betAmount.add(betAmount);
        uint losingPrize = totalPrize.div(10); 
        // because division rounds down, we calculate the losing prize first
        // this is so that the winning prize will always be the "rounded up" portion and be bigger 
        // than the losing prize if the bet amounts are really small
        uint winningPrize = totalPrize.sub(losingPrize);       

        if (gameEndState == GameEndState.Draw) {
            asyncTransfer(player1, betAmount);
            asyncTransfer(player2, betAmount);
            emit PaidToEscrow(player1, betAmount);
            emit PaidToEscrow(player2, betAmount);
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