'use strict';

const emptyAddress = '0x0000000000000000000000000000000000000000';
const emptyBytes32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

// https://ethereum.stackexchange.com/questions/30024/how-to-keccak256-multiple-types-in-web3js-to-match-solidity-keccak256
function keccak256(...args) {
  args = args.map(arg => {
    if (typeof arg === 'string') {
      if (arg.substring(0, 2) === '0x') {
          return arg.slice(2)
      } else {
          return web3.toHex(arg).slice(2)
      }
    }

    if (typeof arg === 'number') {
      return leftPad((arg).toString(16), 64, 0)
    } else {
      return ''
    }
  })

  args = args.join('')

  return web3.sha3(args, { encoding: 'hex' })
}

function leftPad (str, len, ch) {
  // convert `str` to a `string`
  str = str + '';
  // `len` is the `pad`'s length now
  len = len - str.length;
  // doesn't need to pad
  if (len <= 0) return str;
  // `ch` defaults to `' '`
  if (!ch && ch !== 0) ch = ' ';
  // convert `ch` to a `string` cuz it could be a number
  ch = ch + '';
  // cache common use cases
  if (ch === ' ' && len < 10) return cache[len] + str;
  // `pad` starts with an empty string
  var pad = '';
  // loop
  while (true) {
    // add `ch` to `pad` if `len` is odd
    if (len & 1) pad += ch;
    // divide `len` by 2, ditch the remainder
    len >>= 1;
    // "double" the `ch` so this operation count grows logarithmically on `len`
    // each time `ch` is "doubled", the `len` would need to be "doubled" too
    // similar to finding a value in binary search tree, hence O(log(n))
    if (len) ch += ch;
    // `len` is 0, exit the loop
    else break;
  }
  // pad `str`!
  return pad + str;
}

function generateRandomBytes32() {
  let bytes = secureRandom(32, {type: 'Array'});
  let hexBytes = bytes.map(x => x.toString(16));
  return "0x" + hexBytes.join("");
}

window.addEventListener('load', () => {

  /*window.web3Account = null;
  window.setInterval(function() {

    web3.eth.getAccounts((error, accounts) => {
      if (error) {
        console.log(error);
      }

      var account = accounts[0];
      if (account != window.web3Account) {
        window.web3Account = account;
        app.initWeb3();
        game.initWeb3();
      }
      
    });

  }, 2000);*/

  window.web3Provider = null;
  // https://github.com/mesirendon/DappExample/blob/master/src/main.js
  if (typeof web3 !== 'undefined') {
    console.log('Web3 injected browser: OK.')
    window.web3Provider = window.web3.currentProvider;
  } else {
    console.log('Web3 injected browser: Fail. You should consider trying MetaMask.');
    window.web3Provider = new Web3.providers.HttpProvider('http://localhost:8545');
  }

  window.web3 = new Web3(window.web3Provider);

  let setGameToHashValue = function() {
    console.log("hash changed!");
    if (window.location.hash.substr(0, 3) == "#0x") {
      window.game.gameAddress = window.location.hash.substr(1);
      window.game.visible = true;
      window.app.visible = false;
    } else {
      window.game.visible = false;
      window.app.visible = true;
    }
  }
  window.onhashchange = setGameToHashValue;
  setTimeout(setGameToHashValue, 1);

  window.app = new Vue({
    el: '#app',
    data: {
      visible: true,
      contracts: {},
      account: "",
      playerGames: {},
      openGames: {},
      newGameOpponent: "",
    },

    created: function () {
      return this.initWeb3();
    },

    methods: {

      initWeb3: function () {
        web3.eth.getAccounts((error, accounts) => {
          if (error) {
            console.log(error);
          }

          var account = accounts[0];
          this.account = account;

          return this.initContract();
        });
      },

      initContract: function () {
        axios.get('Lobby.json').then(response => {
          let data = response.data;

          // Get the necessary contract artifact file and instantiate it with truffle-contract
          var LobbyArtifact = data;
          console.log(this.contracts);
          this.contracts.Lobby = TruffleContract(LobbyArtifact);

          // Set the provider for our contract
          this.contracts.Lobby.setProvider(window.web3Provider);

          // Subscribe to events
          this.contracts.Lobby.deployed().then(instance => {
            let lobbyInstance = instance;

            let events = lobbyInstance.allEvents({ address: null }, (error, log) => {
              console.log("lobby event triggered");
              this.getGames();
            });
          });

          return axios.get('Battleship.json');
        }).then(response => {
          let data = response.data;

          // Get the necessary contract artifact file and instantiate it with truffle-contract
          var BattleshipArtifact = data;
          this.contracts.Battleship = TruffleContract(BattleshipArtifact);

          // Set the provider for our contract
          this.contracts.Battleship.setProvider(window.web3Provider);

          // Use our contract to retrieve and mark the adopted pets
          return this.getGames();
        });
      },

      getGames: function () {
        this.getPlayerGames();
        this.getOpenGames();
      },

      getPlayerGames: function () {
        this.contracts.Lobby.deployed().then(instance => {
          let lobbyInstance = instance;

          return lobbyInstance.getGamesBelongingToPlayer.call();
        }).then(gameAddresses => {
          console.log("Games List", gameAddresses);
          for (let i = 0; i < gameAddresses.length; i++) {

            let closure = () => {
              var gameAddress = gameAddresses[i];
              this.$set(this.playerGames, gameAddress, {});

              var battleshipInstance = this.contracts.Battleship.at(gameAddress);
              battleshipInstance.player1.call().then(val => {
                console.log("battleship1", gameAddress, val);
                //this.games[gameAddress].player1 = val;
                this.$set(this.playerGames[gameAddress], 'player1', val);
              });
              battleshipInstance.player2.call().then(val => {
                console.log("battleship2", gameAddress, val);
                this.$set(this.playerGames[gameAddress], 'player2', val);
              });
              battleshipInstance.gameState.call().then(val => {
                console.log("battleshipGs", gameAddress, val);
                this.$set(this.playerGames[gameAddress], 'state', val);
              });
              battleshipInstance.gameEndState.call().then(val => {
                console.log("battleshipGes", gameAddress, val);
                this.$set(this.playerGames[gameAddress], 'endState', val);
              });
              battleshipInstance.createdAt.call().then(val => {
                this.$set(this.playerGames[gameAddress], 'createdAt', val);
              });
              battleshipInstance.startedAt.call().then(val => {
                this.$set(this.playerGames[gameAddress], 'startedAt', val);
              });
              battleshipInstance.finishedAt.call().then(val => {
                this.$set(this.playerGames[gameAddress], 'finishedAt', val);
              });
            };
            closure();

          }
        }).catch(function (err) {
          console.log(err.message);
        });
      },

      getOpenGames: function () {
        this.contracts.Lobby.deployed().then(instance => {
          let lobbyInstance = instance;

          return lobbyInstance.getOpenGames.call();
        }).then(gameAddresses => {
          console.log("Open Games List", gameAddresses);
          for (let i = 0; i < gameAddresses.length; i++) {

            if (gameAddresses[i] == "0x0000000000000000000000000000000000000000") {
              // Skip open games that have been deleted
              continue;
            }

            let closure = () => {
              var gameAddress = gameAddresses[i];
              this.$set(this.openGames, gameAddress, {
                gameId: i
              });

              var battleshipInstance = this.contracts.Battleship.at(gameAddress);
              battleshipInstance.player1.call().then(val => {
                console.log("battleship1", gameAddress, val);
                //this.games[gameAddress].player1 = val;
                this.$set(this.openGames[gameAddress], 'player1', val);
              });
              battleshipInstance.player2.call().then(val => {
                console.log("battleship2", gameAddress, val);
                this.$set(this.openGames[gameAddress], 'player2', val);
              });
              battleshipInstance.gameState.call().then(val => {
                console.log("battleshipg", gameAddress, val);
                this.$set(this.openGames[gameAddress], 'state', val);
              });
              battleshipInstance.gameEndState.call().then(val => {
                console.log("battleshipGes", gameAddress, val);
                this.$set(this.playerGames[gameAddress], 'endState', val);
              });
              battleshipInstance.createdAt.call().then(val => {
                this.$set(this.playerGames[gameAddress], 'createdAt', val);
              });
              battleshipInstance.startedAt.call().then(val => {
                this.$set(this.playerGames[gameAddress], 'startedAt', val);
              });
              battleshipInstance.finishedAt.call().then(val => {
                this.$set(this.playerGames[gameAddress], 'finishedAt', val);
              });
            };
            closure();

          }
        }).catch(function (err) {
          console.log(err.message);
        });
      },

      newGame: function () {
        console.log("newgame called");

        this.contracts.Lobby.deployed().then(lobbyInstance => {

          if (this.newGameOpponent) {

            return lobbyInstance.createGameWithOpponent(this.newGameOpponent, { from: this.account });

          } else {

            // Execute adopt as a transaction by sending account
            return lobbyInstance.createOpenGame({ from: this.account });
          }
        }).then(result => {
          return this.getGames();
        }).catch(err => {
          console.log(err.message);
        });

      },

      joinOpenGame: function (gameId) {
        this.contracts.Lobby.deployed().then(lobbyInstance => {
          // Execute adopt as a transaction by sending account
          return lobbyInstance.joinOpenGame(gameId, { from: this.account });
        }).then(result => {
          return this.getGames();
        }).catch(err => {
          console.log(err.message);
        });
      },

      enterGame: function (gameAddress) {
        game.gameAddress = "";
        game.gameAddress = gameAddress;
      },

      getGameStateString: function () {
        let gameStateMapping = ['Created', 'PlayersJoined', 'Started', 'Finished', 'ShipsRevealed', 'Ended'];
        return gameStateMapping[this.gameState];
      },
      getGameEndStateString: function () {
        let gameEndStateMapping = ['Unknown', 'Draw', 'Player1WinsValidGame', 'Player2WinsValidGame', 'Player1WinsInvalidGame', 'Player2WinsInvalidGame'];
        return gameEndStateMapping[this.gameEndState];
      }

    },
  });

  window.game = new Vue({
    el: '#game',
    data: {
      visible: false,
      contracts: {},      
      gameAddress: "",
      gameState: -1,
      gameEndState: -1,
      boardWidth: 0,
      boardHeight: 0,
      boardShips: [],
      addShips: {
        board: [],
        rotation: "horizontal"
      },
      account: "",
      myPlayerInfo: {
        hiddenShips: [],
        revealShips: [],
        moves: []
      },
      opponent: "",
      opponentPlayerInfo: {
        hiddenShips: [],
        revealShips: [],
        moves: []        
      },
      myShips: [],
      whoseTurn: "",
      waitingForMovesUpdate: false,
    },
    created: function () {

      return this.initWeb3();
    },
    methods: {

      initWeb3: function () {
        web3.eth.getAccounts((error, accounts) => {
          if (error) {
            console.log(error);
          }

          var account = accounts[0];
          this.account = account;

          return this.initContract();
        });
      },

      initContract: function () {
        axios.get('Battleship.json').then(response => {
          let data = response.data;

          // Get the necessary contract artifact file and instantiate it with truffle-contract
          var BattleshipArtifact = data;
          this.contracts.Battleship = TruffleContract(BattleshipArtifact);

          // Set the provider for our contract
          this.contracts.Battleship.setProvider(window.web3Provider);

          // Use our contract to retrieve and mark the adopted pets
          return this.initBoard();
        });
      },

      initBoard: function () {
        if (!this.gameAddress) {
          return;
        }

        var battleshipInstance = this.contracts.Battleship.at(this.gameAddress);

        battleshipInstance.allEvents({ address: null }, (error, log) => {
          console.log("game event triggered", error, log);
        });

        // Get current Game State and subscribe to game state changed events
        var stateChangedEvent = battleshipInstance.StateChanged({}, {}, (error, result) => {
          if (!error) {
            battleshipInstance.gameState.call().then(val => {
              this.gameState = val.toNumber();
            });
            battleshipInstance.gameEndState.call().then(val => {
              this.gameEndState = val.toNumber();
            });
            console.log(result);
            this.updatePlayerInfoFromChain();
          }
        });

        this.updatePlayerInfoFromChain();
        // Get move added event
        var moveMadeEvent = battleshipInstance.MoveMade({}, {}, (error, result) => {
          if (!error) {
            this.updatePlayerInfoFromChain();
          }
        });
        // Get move added event
        var shipAddedEvent = battleshipInstance.ShipAdded({}, {}, (error, result) => {
          if (!error) {
            this.updatePlayerInfoFromChain();
          }
        });

        battleshipInstance.gameState.call().then(val => {
          this.gameState = val.toNumber();
        });
        battleshipInstance.gameState.call().then(val => {
          this.gameState = val.toNumber();
        });
        
        battleshipInstance.player1.call().then(val => {
          console.log("game-player1", this.gameAddress, val, val.toString());

          return  battleshipInstance.boardWidth.call();
        }).then(val => {
          console.log("game-boardWidth", this.gameAddress, val, val.toString());
          this.boardWidth = val.toNumber();

          return battleshipInstance.boardHeight.call();
        }).then(val => {
          console.log("game-boardHeight", this.gameAddress, val, val.toString());
          this.boardHeight = val.toNumber();

          return battleshipInstance.getBoardShips.call();
        }).then(val => {
          console.log("game-boardShips", this.gameAddress, val, val.toString());
          this.boardShips = val.map(x => x.toNumber());
        });
      },

      updatePlayerInfoFromChain: function () {
        var battleshipInstance = this.contracts.Battleship.at(this.gameAddress);

        // Get opponent
        var getOpponentMovesPromise = battleshipInstance.getOpponentAddress.call().then(val => {
          console.log("game-opponent", this.gameAddress, val);
          this.opponent = val;

          // Get opponent moves count
          return battleshipInstance.getPlayerMovesCount.call(this.opponent);
        }).then(val => {
          let movesCount = val;

          // Get opponent moves
          return battleshipInstance.getPlayerMovesPacked.call(this.opponent).then(val => {
            console.log("game-opponentmoves", val);
            let movesX = val[0];
            let movesY = val[1];
            let movesResult = val[2];
            let movesShipNumber = val[3];

            this.opponentPlayerInfo.moves = [];
            for(let i = 0; i < movesCount; i++) {
              this.opponentPlayerInfo.moves.push({
                x: movesX[i].toNumber(),
                y: movesY[i].toNumber(),
                result: this.convertNumberToMoveResult(movesResult[i].toNumber()),
                shipNumber: movesShipNumber[i].toNumber()
              });
            }
            console.log("game-opponentmoves2", this.opponentPlayerInfo.moves);
          });
        });
        
        // Get my moves count
        var getMyMovesPromise = battleshipInstance.getPlayerMovesCount.call(this.account).then(val => {
          let movesCount = val;

          // Get my moves
          return battleshipInstance.getPlayerMovesPacked.call(this.account).then(val => {
            console.log("game-mymoves", val);
            let movesX = val[0];
            let movesY = val[1];
            let movesResult = val[2];
            let movesShipNumber = val[3];

            this.myPlayerInfo.moves = [];
            for(let i = 0; i < movesCount; i++) {
              this.myPlayerInfo.moves.push({
                x: movesX[i].toNumber(),
                y: movesY[i].toNumber(),
                result: this.convertNumberToMoveResult(movesResult[i].toNumber()),
                shipNumber: movesShipNumber[i].toNumber()
              });
              console.log("game-mymoves2", this.myPlayerInfo.moves);
            }
          });
        });

        // Get hidden ships
        var getOpponentHiddenShipsPromise = battleshipInstance.getHiddenShipsPackedForPlayer.call(this.opponent).then(val => {
          this.$set(this.opponentPlayerInfo, 'hiddenShips', val);
        });

        var getMyHiddenShipsPromise = battleshipInstance.getHiddenShipsPackedForPlayer.call(this.account).then(val => {
          this.$set(this.myPlayerInfo, 'hiddenShips', val);
        });

        // Get revealed ships
        var getOpponentRevealShipsPromise = battleshipInstance.getRevealShipsPackedForPlayer.call(this.opponent).then(val => {
          let widthArr = val[0];
          let heightArr = val[1];
          let xArr = val[2];
          let yArr = val[3];

          this.opponentPlayerInfo.revealShips = [];
          for(let i = 0; i < widthArr.length; i++) {
            this.opponentPlayerInfo.revealShips.push({
              width: widthArr[i].toNumber(),
              height: heightArr[i].toNumber(),
              x: xArr[i].toNumber(),
              y: yArr[i].toNumber()
            });
          }
          
          this.opponentPlayerInfo.revealShips = val;
        });

        var getMyRevealShipsPromise = battleshipInstance.getRevealShipsPackedForPlayer.call(this.account).then(val => {
          let widthArr = val[0];
          let heightArr = val[1];
          let xArr = val[2];
          let yArr = val[3];

          this.myPlayerInfo.revealShips = [];
          for(let i = 0; i < widthArr.length; i++) {
            this.myPlayerInfo.revealShips.push({
              width: widthArr[i].toNumber(),
              height: heightArr[i].toNumber(),
              x: xArr[i].toNumber(),
              y: yArr[i].toNumber()
            });
          }
        });

        // Get whose turn
        var getWhoseTurnPromise = battleshipInstance.getWhoseTurn.call().then(val => {
          console.log("Whose turn", val);
          this.whoseTurn = val;
        });

        // Recall ships from localstorage
        this.myShips = [];
        var recallHiddenShipsPromise = this.getHiddenShips().then(hiddenShips => {
          console.log("getHiddenShips");
          this.myShips = [];
          for (let i = 0; i < hiddenShips.length; i++) {
            let commitHash = hiddenShips[i];
            let localStorageKey = this.gameAddress + '*' + this.account + '*' + commitHash;
            if (localStorage.getItem(localStorageKey) !== null) {
              let data = JSON.parse(localStorage.getItem(localStorageKey));
              this.myShips.push(data);
            }
          }
        });

        Promise.all([getMyMovesPromise, getMyHiddenShipsPromise, getMyRevealShipsPromise, getOpponentMovesPromise, getOpponentHiddenShipsPromise, getOpponentRevealShipsPromise, getWhoseTurnPromise, recallHiddenShipsPromise]).then(val => {
          console.log("Updated Moves!", val);
          this.waitingForMovesUpdate = false;
        });
      },

      addShipResetHighlightPlacement: function () {
        for (let i = 0; i < this.boardHeight; i++) {
          this.$set(this.addShips.board, i, new Array(this.boardWidth));
        }
      },

      addShipHighlightPlacement: function (x, y) {
        let shipLength = this.boardShips[this.myShips.length];
        let shipRotation = this.addShips.rotation;
        let width = 0; 
        let height = 0;
        if (shipRotation == "horizontal") {
          width = shipLength;
          height = 1;
        } else {
          width = 1;
          height = shipLength;
        }

        //console.log("addShip", width, height, x, y);
        //console.log("why", y, y + height, this.boardHeight, Math.min(y + height, this.boardHeight));

        for (let i = 0; i < this.boardHeight; i++) {
          this.$set(this.addShips.board, i, new Array(this.boardWidth));
        }

        for(let i = y; i < Math.min(y + height, this.boardHeight); i++) {
          //console.log("inside", i);
          for(let j = x; j < Math.min(x + width, this.boardWidth); j++) {
            //console.log("inside2", i, j);

            if (y + height > this.boardHeight || x + width > this.boardWidth) {
              this.addShips.board[i][j] = "invalid";
            } else if (this.myShipsBoard[i][j] !== undefined) {
              this.addShips.board[i][j] = "invalid";
            } else{
              this.addShips.board[i][j] = "valid";
            }            
          }
        }
      },

      addShipSavePlacement: function (x, y) {
        let currentShipIndex = this.myShips.length;

        let shipLength = this.boardShips[currentShipIndex];
        let shipRotation = this.addShips.rotation;
        let width = 0; 
        let height = 0;
        if (shipRotation == "horizontal") {
          width = shipLength;
          height = 1;
        } else {
          width = 1;
          height = shipLength;
        }

        // Check placement is within the board
        if (y + height > this.boardHeight || x + width > this.boardWidth) {
          return;
        }

        // Check placement does not overlap previous ships
        for(let i = y; i < y + height; i++) {
          for(let j = x; j < x + width; j++) {

            if (this.myShipsBoard[i][j] !== undefined) {
              return;
            }        
          }
        }

        this.myShips.push({
          width: width,
          height: height,
          x: x,
          y: y
        });
        
      },

      submitHiddenShips: function() {
        var battleshipInstance = this.contracts.Battleship.at(this.gameAddress);
        
        let commitHashPromises = [];
        let commitHashes = [];
        let commitNonceHashes = [];
        for(let i = 0; i < this.myShips.length; i++) {
          let ship = this.myShips[i];
          let nonce = generateRandomBytes32();
          this.$set(this.myShips[i], "nonce", nonce);
          let promise = battleshipInstance.calculateCommitHash(ship.width, ship.height, ship.x, ship.y, nonce);
          commitHashPromises.push(promise);
        };
        Promise.all(commitHashPromises).then(response => {
          console.log("Hashes calculated", response);
          for (let i = 0; i < response; i++) {
            let commitHash = response[i];
            console.log("submit hidden ship", i, commitHash);
            commitHashes.push(commitHash);

            // store ship hash to ship position locally
            // (we store the hash rather than object of the ship positions, in case there is some kind of address reuse)
            let localStorageKey = this.gameAddress + '*' + this.account + '*' + commitHash;
            localStorage.setItem(localStorageKey, JSON.stringify(this.myShips[i]));
          }
        });

        console.log(commitHashes);

        battleshipInstance.submitHiddenShipsPacked(commitHashes, { from: this.account }).then(response => {
          console.log("hidden ships submitted packed");
        });
        
      },

      getHiddenShips: function() {
        var battleshipInstance = this.contracts.Battleship.at(this.gameAddress);
        return battleshipInstance.getHiddenShipsPackedForPlayer(this.account).then(response => {
          let hiddenShips = [];
          let commitHashes = response;
          for (let i = 0; i < commitHashes.length; i++) {
            hiddenShips.push(commitHashes[i]);
          }
          return hiddenShips;
        });
      },

      resetMyShips: function() {
        this.myShips = [];
      },

      makeMove: function(x, y) {
        if (this.whoseTurn != this.account) {
          alert("It's not your turn yet!");
          return;
        }

        if (this.waitingForMovesUpdate) {
          alert("Please wait for the chain to update. If it takes too long you can try to refresh the page.");
          return;
        }

        if (this.myMovesBoard[y][x] !== undefined) {
          alert("You have already made a shot at this coordinate!");
          return;
        }

        if (this.myShips.length != this.boardShips.length) {
          alert("It seems that the data about your ships is missing. Information about your ships is not stored on the blockchain until you have revealed it, therefore it is stored only it localstorage. Please use the same computer/browser to continue the game. Try to refresh the page and see if it works.");
          return;
        }

        var battleshipInstance = this.contracts.Battleship.at(this.gameAddress);

        // If opponent has already made a move, we need to respond first
        if (this.opponentPlayerInfo.moves.length > 0) {
          console.log("need to report last opponent move status");
          let lastMove = this.opponentPlayerInfo.moves[this.opponentPlayerInfo.moves.length - 1];
          let moveResult = 'Unknown';
          let shipNumber = 0;
          if (this.myShipsBoard[lastMove.y][lastMove.x] === undefined) {
            moveResult = 'Miss';
          } else {
            moveResult = 'Hit';
            shipNumber = this.myShipsBoard[lastMove.y][lastMove.x];
          }
          let moveResultNumber = this.convertMoveResultToNumber(moveResult);
          console.log(x, y, x * 1, y * 1, moveResultNumber * 1, shipNumber * 1);

          console.log("to submit move and update last move");
          battleshipInstance.makeMoveAndUpdateLastMoveWithResult(x * 1, y * 1, moveResultNumber * 1, shipNumber * 1, { from: this.account }).then(response => {
            console.log("move submitted and updated last move");
            this.waitingForMovesUpdate = true;
          });
        } else {        
          battleshipInstance.makeMove(x * 1, y * 1, { from: this.account }).then(response => {
            console.log("move submitted");
            this.waitingForMovesUpdate = true;
          });
        }
      },

      tryToDeclareGameFinished: function () {
        var battleshipInstance = this.contracts.Battleship.at(this.gameAddress);

        battleshipInstance.tryToDeclareGameFinished({ from: this.account }).then(response => {
          console.log("tried to declare game finished");
          this.waitingForMovesUpdate = true;
        });
      },

      revealShips: function () {
        if (this.myShips.length != this.boardShips.length) {
          alert("It seems that the data about your ships is missing. Information about your ships is not stored on the blockchain until you have revealed it, therefore it is stored only it localstorage. Please use the same computer/browser to continue the game. Try to refresh the page and see if it works.");
          return;
        }

        var battleshipInstance = this.contracts.Battleship.at(this.gameAddress);

        let ships = this.myShips;
        let packedShips = {width: [], height: [], x: [], y: [], nonce: []};
        for (let i = 0; i < ships.length; i++) {
            packedShips.width.push(ships[i].width);
            packedShips.height.push(ships[i].height);
            packedShips.x.push(ships[i].x);
            packedShips.y.push(ships[i].y);
            packedShips.nonce.push(ships[i].nonce);
        }

        console.log(packedShips.width, packedShips.height, packedShips.x, packedShips.y, packedShips.nonce);
        battleshipInstance.revealShipsPacked(packedShips.width, packedShips.height, packedShips.x, packedShips.y, packedShips.nonce, { from: this.account }).then(response => {
          console.log("tried to declare game finished");
          this.waitingForMovesUpdate = true;
        });
      },

      convertMoveResultToNumber: function (moveResult) {
        let moveResultEnum = {'Unknown': 0, 'Miss': 1, 'Hit': 2};
        return moveResultEnum[moveResult];
      },

      convertNumberToMoveResult: function (moveResultNumber) {
        let moveResultEnum = ['Unknown', 'Miss', 'Hit'];
        return moveResultEnum[moveResultNumber];
      },

    },
    
    computed: {
      myShipsBoard: function () {
        let board = [];
        
        if (this.boardWidth == 0 || this.boardHeight == 0) {
          return [];
        }

        for (let i = 0; i < this.boardHeight; i++) {
          board[i] = new Array(this.boardWidth);
        }

        for (let shipIndex = 0; shipIndex < this.myShips.length; shipIndex++) {
          
          let myShip = this.myShips[shipIndex];
          let x = myShip.x;
          let y = myShip.y;
          let width = myShip.width;
          let height = myShip.height;

          for(let i = y; i < y + height; i++) {
            for(let j = x; j < x + width; j++) {
              //console.log("board", board, i, j, shipIndex);
              board[i][j] = shipIndex;
            }
          }

        }

        return board;
      },
      opponentShipsBoard: function () {
        let board = [];
        for (let i = 0; i < this.boardHeight; i++) {
          board[i] = new Array(this.boardWidth);
        }

        for (let shipIndex = 0; shipIndex < this.myShips.length; shipIndex++) {
          
          let myShip = this.myShips[shipIndex];
          let x = myShip.x;
          let y = myShip.y;
          let width = myShip.width;
          let height = myShip.height;

          for(let i = y; i < y + height; i++) {
            for(let j = x; j < x + width; j++) {
              board[i][j] = shipIndex;
            }
          }

        }

        return board;
      },
      opponentMovesBoard: function () {
        let board = [];
        for (let i = 0; i < this.boardHeight; i++) {
          board[i] = new Array(this.boardWidth);
        }

        for (let i = 0; i < this.opponentPlayerInfo.moves.length; i++) {
          let move = this.opponentPlayerInfo.moves[i];
          board[move.y][move.x] = move;
        }

        return board;
      },
      myMovesBoard: function () {
        let board = [];
        for (let i = 0; i < this.boardHeight; i++) {
          board[i] = new Array(this.boardWidth);
        }

        for (let i = 0; i < this.myPlayerInfo.moves.length; i++) {
          let move = this.myPlayerInfo.moves[i];
          board[move.y][move.x] = move;
        }

        return board;
      },
      opponentHitCount: function() {
        let count = 0;
        for (let i = 0; i < this.opponentPlayerInfo.moves.length; i++) {
          let move = this.opponentPlayerInfo.moves[i];
          if (move.result == 'Hit') {
            count++;
          }
        }
        return count;
      },
      myHitCount: function() {
        let count = 0;
        for (let i = 0; i < this.myPlayerInfo.moves.length; i++) {
          let move = this.myPlayerInfo.moves[i];
          if (move.result == 'Hit') {
            count++;
          }
        }
        return count;
      },
      myHiddenShipsOnChainCount: function () {
        return this.myPlayerInfo.hiddenShips.filter(x => x != emptyBytes32).length;
      },
      boardShipsSum: function () {
        return this.boardShips.reduce((a, b) => a + b, 0);
      },
      getGameStateString: function () {
        let gameStateMapping = ['Created', 'PlayersJoined', 'Started', 'Finished', 'ShipsRevealed', 'Ended'];
        return gameStateMapping[this.gameState];
      },
      getGameEndStateString: function () {
        let gameEndStateMapping = ['Unknown', 'Draw', 'Player1WinsValidGame', 'Player2WinsValidGame', 'Player1WinsInvalidGame', 'Player2WinsInvalidGame'];
        return gameEndStateMapping[this.gameEndState];
      },
    },
    watch: {
      gameAddress: function (val) {
        this.initWeb3();
      },
    }
  });

});

/*

App = {
  web3Provider: null,
  contracts: {},

  init: function () {
    return App.initWeb3();
  },

  initWeb3: function () {
    // Is there an injected web3 instance?
    if (typeof web3 !== 'undefined') {
      App.web3Provider = web3.currentProvider;
    } else {
      // If no injected web3 instance is detected, fall back to Ganache
      App.web3Provider = new Web3.providers.HttpProvider('http://localhost:7545');
    }
    web3 = new Web3(App.web3Provider);

    return App.initContract();
  },

  initContract: function () {
    $.getJSON('Lobby.json', function (data) {
      // Get the necessary contract artifact file and instantiate it with truffle-contract
      var LobbyArtifact = data;
      App.contracts.Lobby = TruffleContract(LobbyArtifact);

      // Set the provider for our contract
      App.contracts.Lobby.setProvider(App.web3Provider);

      $.getJSON('Battleship.json', function (data) {
        // Get the necessary contract artifact file and instantiate it with truffle-contract
        var BattleshipArtifact = data;
        App.contracts.Battleship = TruffleContract(BattleshipArtifact);

        // Set the provider for our contract
        App.contracts.Battleship.setProvider(App.web3Provider);

        // Use our contract to retrieve and mark the adopted pets
        return App.getGames();
      });

    });

    $('#start-new-game').on('click', App.newGame);

  },

  getGames: function () {
    App.contracts.Lobby.deployed().then(function (instance) {
      lobbyInstance = instance;

      return lobbyInstance.getGamesBelongingToPlayer.call();
    }).then(function (gameAddresses) {
      console.log("Games List", gameAddresses);
      for (i = 0; i < gameAddresses.length; i++) {
        var gameAddress = gameAddresses[i];
        $('#games-list').append('<div>' + gameAddress + '</div>');

        var battleshipInstance = App.contracts.Battleship.at(gameAddress);
        battleshipInstance.player1.call().then(function (a) {
          console.log("battleship1", a);
        });
        battleshipInstance.player2.call().then(function (a) {
          console.log("battleship2", a);
        });
        battleshipInstance.gameState.call().then(function (a) {
          console.log("battleshipg", a);
        });
      }
    }).catch(function (err) {
      console.log(err.message);
    });
  },

  newGame: function () {
    console.log("newgame called");
    var lobbyInstance;

    web3.eth.getAccounts(function (error, accounts) {
      if (error) {
        console.log(error);
      }

      var account = accounts[0];

      App.contracts.Lobby.deployed().then(function (instance) {
        lobbyInstance = instance;

        // Execute adopt as a transaction by sending account
        return lobbyInstance.createGame({ from: account });
      }).then(function (result) {
        return App.getGames();
      }).catch(function (err) {
        console.log(err.message);
      });
    });
  },

  markAdopted: function (adopters, account) {
    var adoptionInstance;

    App.contracts.Adoption.deployed().then(function (instance) {
      adoptionInstance = instance;

      return adoptionInstance.getAdopters.call();
    }).then(function (adopters) {
      for (i = 0; i < adopters.length; i++) {
        if (adopters[i] !== '0x0000000000000000000000000000000000000000') {
          $('.panel-pet').eq(i).find('button').text('Success').attr('disabled', true);
        }
      }
    }).catch(function (err) {
      console.log(err.message);
    });
  },

  handleAdopt: function (event) {
    event.preventDefault();

    var petId = parseInt($(event.target).data('id'));

    var adoptionInstance;

    web3.eth.getAccounts(function (error, accounts) {
      if (error) {
        console.log(error);
      }

      var account = accounts[0];

      App.contracts.Adoption.deployed().then(function (instance) {
        adoptionInstance = instance;

        // Execute adopt as a transaction by sending account
        return adoptionInstance.adopt(petId, { from: account });
      }).then(function (result) {
        return App.markAdopted();
      }).catch(function (err) {
        console.log(err.message);
      });
    });
  }

};

$(function () {
  $(window).load(function () {
    App.init();
  });
}); 

*/
