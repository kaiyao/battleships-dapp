'use strict';

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

  window.app = new Vue({
    el: '#app',
    data: {
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
                console.log("battleshipg", gameAddress, val);
                this.$set(this.playerGames[gameAddress], 'state', val);
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
      }

    }


  });

  window.game = new Vue({
    el: '#game',
    data: {
      contracts: {},
      account: "",
      gameAddress: "",
      gameState: -1,
      boardWidth: 0,
      boardHeight: 0,
      boardShips: [],
      addShips: {
        board: [],
        rotation: "horizontal"
      },
      myShips: [],     
      myMoves: [],
      opponent: "",
      opponentMoves: []
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
            console.log(result);
          }
        });

        // Get player info (not really used)
        battleshipInstance.player1.call().then(val => {
          console.log("game-player1", this.gameAddress, val, val);

          return battleshipInstance.players.call(val);
        }).then(val => {
          console.log(val);
        });

        // Recall ships from localstorage
        /*let localStorageKey = this.gameAddress + '*' + this.account;
        if (localStorage.getItem(localStorageKey) !== null) {
          let data = JSON.parse(localStorage.getItem(localStorageKey));
          this.myShips = data;
        }*/

        this.myShips = [];
        this.getHiddenShips().then(hiddenShips => {
          console.log("getHiddenShips");
          for (let i = 0; i < hiddenShips.length; i++) {
            let hiddenShip = hiddenShips[i];
            let localStorageKey = this.gameAddress + '*' + this.account + '*' + hiddenShip.commitHash;
            if (localStorage.getItem(localStorageKey) !== null) {
              let data = JSON.parse(localStorage.getItem(localStorageKey));
              this.myShips[i] = data;
            }
          }
        });

        // Get opponent
        battleshipInstance.getOpponentAddress.call().then(val => {
          console.log("game-opponent", this.gameAddress, val);
          this.opponent = val;

          // Get opponent moves count
          return battleshipInstance.getPlayerMovesCount.call(this.opponent);
        }).then(val => {
          let movesCount = val;

          // Get opponent moves
          return battleshipInstance.getPlayerMovesPacked.call(this.opponent).then(val => {
            console.log("game-opponentmoves", val);
            this.opponentMoves = [];
            for(let i = 0; i < movesCount; i++) {
              this.opponentMoves.push({
                x: val[i * 3].toNumber(),
                y: val[i * 3 + 1].toNumber(),
                result: val[i * 3 + 2].toNumber()
              });
            }
            console.log("game-opponentmoves2", this.opponentMoves);
          });
        });
        
        // Get my moves count
        battleshipInstance.getPlayerMovesCount.call(this.account).then(val => {
          let movesCount = val;

          // Get my moves
          return battleshipInstance.getPlayerMovesPacked.call(this.account).then(val => {
            console.log("game-mymoves", val);
            this.myMoves = [];
            for(let i = 0; i < movesCount; i++) {
              this.myMoves.push({
                x: val[i].toNumber(),
                y: val[i * 3 + 1].toNumber(),
                result: val[i * 3 + 2].toNumber()
              });
              console.log("game-mymoves2", this.myMoves);
            }
          });
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
        
        let hiddenShipsPacked = [];
        for(let i = 0; i < this.myShips.length; i++) {
          let ship = this.myShips[i];
          let nonce = generateRandomBytes32();
          this.$set(this.myShips[i], "nonce", nonce);
          let commitNonceHash = keccak256(nonce);
          let commitHash = keccak256(ship.width, ship.height, ship.x, ship.y, nonce);
          console.log("submit hidden ship", i, commitHash, commitNonceHash);
          hiddenShipsPacked.push(commitHash, commitNonceHash);

          // store ship hash to ship position locally
          // (we store the hash rather than object of the ship positions, in case there is some kind of address reuse)
          let localStorageKey = this.gameAddress + '*' + this.account + '*' + commitHash;
          localStorage.setItem(localStorageKey, JSON.stringify(this.myShips[i]));
        };

        console.log(hiddenShipsPacked);

        battleshipInstance.submitHiddenShipsPacked(hiddenShipsPacked, { from: this.account }).then(response => {
          console.log("hidden ships submitted packed");
        });
        
      },

      getHiddenShips: function() {
        var battleshipInstance = this.contracts.Battleship.at(this.gameAddress);
        return battleshipInstance.getHiddenShipsPacked().then(response => {
          let hiddenShips = [];
          for (let i = 0; i < response.length; i += 2) {
            hiddenShips.push({
              commitHash: response[i],
              commitNonceHash: response[i + 1]
            });
          }
          return hiddenShips;
        });
      },

      resetMyShips: function() {
        this.myShips = [];
      },

      makeMove: function(x, y) {
        var battleshipInstance = this.contracts.Battleship.at(this.gameAddress);

        // If opponent has already made a move, we need to respond first
        if (this.opponentMoves.length > 0) {
          console.log("need to report last opponent move status");
          let lastMove = this.opponentMoves[this.opponentMoves.length - 1];
          let moveResult = 'Unknown';
          let shipNumber = 0;
          if (this.myShipsBoard[lastMove.y][lastMove.x] === undefined) {
            moveResult = 'Miss';
          } else {
            moveResult = 'Hit';
            shipNumber = this.myShipsBoard[lastMove.y][lastMove.x];
          }
          let moveResultNumber = this.convertMoveResultToNumber(moveResult);
          battleshipInstance.makeMoveAndUpdateLastMoveWithResult(x * 1, y * 1, moveResult * 1, shipNumber * 1, { from: this.account }).then(response => {
            console.log("move submitted and updated last move");
          });
        } else {        
          battleshipInstance.makeMove(x * 1, y * 1, { from: this.account }).then(response => {
            console.log("move submitted");
          });
        }
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
      getGameStateString: function () {
        let gameStateMapping = ['Created', 'PlayersJoined', 'Started', 'Finished', 'Paid'];
        return gameStateMapping[this.gameState];
      }
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
