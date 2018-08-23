pragma solidity ^0.4.23;

contract Battleship {
    
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
    }
    
    /*
        Created: Game is created, waiting for players to join (ships may be added too)
        PlayersJoined: Players have joined, waiting for ships to be added
        Started: Players have placed their ships and can start to hit each other
        Finished: One player has hit all the squares of the opponent ship (i.e. hitCount > sum(boardShips))
        (or someone declares they have lost)??
        PayoutReady: Winner has been determined, players can claim their payment
    */
    enum GameState { Created, PlayersJoined, Started, Finished, Paid }
    GameState public gameState;

    uint createdAt;
    uint startedAt;
    
    address public player1;
    address public player2;
    address winner;

    address owner;
    
    mapping (address => PlayerInfo) public players;
    uint playerCount;

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
        owner = msg.sender;     
        gameState = GameState.Created;
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
        if (player1 == msg.sender) {
            return player2;
        } else {            
            return player1;
        }
    }

    function submitHiddenShip(uint shipNumber, bytes32 commitHash, bytes32 commitNonceHash) public {
        require(gameState == GameState.Created || gameState == GameState.PlayersJoined);
        require(shipNumber >=0 && shipNumber < shipsPerPlayer);
        require(msg.sender == player1 || msg.sender == player2);

        players[msg.sender].hiddenShips[shipNumber] = ShipHidden(commitHash, commitNonceHash);
        if (checkAllHiddenShipsSubmitted()) {
            gameState = GameState.Started;
            emit StateChanged(msg.sender, gameState);
        }        
    }

    // Submit in the format of [commitHash of ship 1], [commitNonceHash of ship 1], [commitHash of ship 2], [commitNonceHash of ship 2], ...
    function submitHiddenShipsPacked(bytes32[shipsPerPlayer * 2] hiddenShipsPacked) public {
        for (uint i = 0; i < shipsPerPlayer; i++) {
            bytes32 commitHash = hiddenShipsPacked[i * 2];
            bytes32 commitNonceHash = hiddenShipsPacked[i * 2 + 1];
            submitHiddenShip(i, commitHash, commitNonceHash);
        }
    }
    
    // Gets in the format of [commitHash of ship 1], [commitNonceHash of ship 1], [commitHash of ship 2], [commitNonceHash of ship 2], ...
    function getHiddenShipsPacked() public view returns (bytes32[shipsPerPlayer * 2]) {
        bytes32[shipsPerPlayer * 2] memory hiddenShipsPacked;
        for (uint i = 0; i < shipsPerPlayer; i++) {
            ShipHidden storage ship = players[msg.sender].hiddenShips[i];
            hiddenShipsPacked[i * 2] = ship.commitHash;
            hiddenShipsPacked[i * 2 + 1] = ship.commitNonceHash;
        }
        return hiddenShipsPacked;
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
    
    function makeMove(uint x, uint y) public {
        require(gameState == GameState.Started, "Game must be started");
        require(msg.sender == player1 || msg.sender == player2, "Sender must be player");
        
        // Check that it is the player's turn
        require(
            (msg.sender == player1 && players[player1].movesCount >= players[player2].movesCount) || 
            (msg.sender == player2 && players[player2].movesCount < players[player1].movesCount),
            "Must be player's turn"
        );
        // Check that player has already submitted move result for previous opponent move
        require(
            (msg.sender == player1 && players[player1].movesCount == 0) ||
            (msg.sender == player1 && players[player2].moves[players[player2].movesCount - 1].result != MoveResult.Unknown) || 
            (msg.sender == player2 && players[player1].moves[players[player1].movesCount - 1].result != MoveResult.Unknown),
            "Must have submited move result"
        );
        
        players[msg.sender].moves[players[msg.sender].movesCount] = Move(x, y, MoveResult.Unknown, 0);
        players[msg.sender].movesCount++;

        emit MoveMade(msg.sender, x, y);
    }

    function getPlayerMovesPacked(address player) public view returns (uint[boardWidth * boardHeight * 4]) {
        uint[boardWidth * boardHeight * 4] memory moves;
        for (uint i = 0; i < getPlayerMovesCount(player); i++) {
            Move storage move = players[player].moves[i];
            moves[i * 4 + 0] = move.x;
            moves[i * 4 + 1] = move.y;
            moves[i * 4 + 2] = convertMoveResultToUInt(move.result);
            moves[i * 4 + 3] = move.shipNumber;
        }
        return moves;
    }

    function getPlayerMovesCount(address player) public view returns (uint) {
        return players[player].movesCount;
    }

    function getPlayerMove(address player, uint index) public view returns (uint[4]) {
        Move storage move = players[player].moves[index];
        uint[4] memory retValue;
        retValue[0] = move.x;
        retValue[1] = move.y;
        retValue[2] = convertMoveResultToUInt(move.result);
        retValue[3] = move.shipNumber;
        return retValue;
    }

    function convertMoveResultToUInt(MoveResult result) public pure returns (uint) {
        if (result == MoveResult.Unknown) return 0;
        if (result == MoveResult.Miss) return 1;
        if (result == MoveResult.Hit) return 2;
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
        }

        emit MoveUpdated(msg.sender, result, shipNumber);

        if (players[opponent].hitCount >= shipSpaces) {
            // opponent has won!
            setGameEnd();
        }
    }

    function makeMoveAndUpdateLastMoveWithResult(uint x, uint y, MoveResult result, uint shipNumber) public {
        updateLastOpponentMoveWithResult(result, shipNumber);
        makeMove(x, y);
    }
    
    function setGameEnd() private {
        require(gameState == GameState.Started);
        require(msg.sender == player1 || msg.sender == player2);
        gameState = GameState.Finished;
        emit StateChanged(msg.sender, gameState);
    }
    
    function revealShip(uint shipNumber, uint width, uint height, uint x, uint y) public {
        require(gameState == GameState.Finished);
        require(msg.sender == player1 || msg.sender == player2);
        require(shipNumber >=0 && shipNumber < shipsPerPlayer);
        require(width == 1 || height == 1);
        require(x + width <= boardWidth);
        require(y + height <= boardWidth);
        require(
            (boardShips[shipNumber] == width && height == 1) || 
            (boardShips[shipNumber] == height && width == 1)
        );
        
        players[msg.sender].revealShips[shipNumber] = Ship(width, height, x, y);
    }
    
    function checkWinner() public view returns (address) {
        require(gameState == GameState.Finished);
        // Check that both players have submitted their ships and nonce
        require(players[player1].revealShipsCount == boardShips.length);
        require(players[player2].revealShipsCount == boardShips.length);
    }
    
}