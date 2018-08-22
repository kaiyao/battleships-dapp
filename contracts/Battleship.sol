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
        uint shipNumber; // if hit, fill in the number of the ship hit (index of the boardShips array) here
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
        address indexed _gameAddress
    );

    event MoveUpdated (
        address indexed _from,
        address indexed _gameAddress
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
        require(gameState == GameState.Started);
        require(msg.sender == player1 || msg.sender == player2);
        
        // Check that it is the player's turn
        require(
            (msg.sender == player1 && players[player1].movesCount >= players[player2].movesCount) || 
            (msg.sender == player2 && players[player2].movesCount < players[player1].movesCount)
        );
        // Check that player has already submitted move result for previous opponent move
        require(
            (msg.sender == player1 && players[player1].movesCount == 0) ||
            (msg.sender == player1 && players[player2].moves[players[player2].movesCount - 1].result != MoveResult.Unknown) || 
            (msg.sender == player2 && players[player1].moves[players[player1].movesCount - 1].result != MoveResult.Unknown)
        );
        
        players[msg.sender].moves[players[msg.sender].movesCount] = Move(x, y, MoveResult.Unknown, 0);
        players[msg.sender].movesCount++;
    }
    
    function updateLastOpponentMoveWithResult(MoveResult result, uint shipNumber) public {
        require(gameState == GameState.Started);
        require(msg.sender == player1 || msg.sender == player2);
        require(result == MoveResult.Miss || (shipNumber >= 0 && shipNumber < shipsPerPlayer));
        
        // You cannot update with "unknown" result
        require(result == MoveResult.Hit || result == MoveResult.Miss);
        address opponent = player1;
        if (msg.sender == player1) {
            opponent = player2;
        }
        uint opponentMoveCount = players[opponent].movesCount;
        require(players[opponent].moves[opponentMoveCount - 1].result == MoveResult.Unknown);

        players[opponent].moves[opponentMoveCount - 1].result = result;
        if (result == MoveResult.Hit) {
            players[opponent].moves[opponentMoveCount - 1].shipNumber = shipNumber;
            players[opponent].hitCount++;
        }

        if (players[opponent].hitCount >= shipSpaces) {
            // opponent has won!
            setGameEnd();
        }
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