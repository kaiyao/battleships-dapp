'use strict';

window.addEventListener('load', () => {

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
      }

    }


  });

  window.game = new Vue({
    el: '#game',
    data: {
      contracts: {},
      account: "",
      gameAddress: "0xa52fed3d29211300a0830003c8b5e437f18c17ec",
      boardWidth: 0,
      boardHeight: 0,
      boardShips: [],
      myShips: [],
      myBoard: [],
      opponentBoard: [],
      addShips: {
        board: [],
        rotation: "horizontal",
        currentShipIndex: 0
      }
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
        var battleshipInstance = this.contracts.Battleship.at(this.gameAddress);
        
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

          for (let i = 0; i < this.boardHeight; i++) {
            //this.myBoard[i] = new Array(this.boardWidth);
            this.$set(this.myBoard, i, new Array(this.boardWidth));
          }
    
          for (let i = 0; i < this.boardHeight; i++) {
            //this.opponentBoard[i] = new Array(this.boardWidth);
            this.$set(this.opponentBoard, i, new Array(this.boardWidth));
          }


        });
      },


      addShipResetHighlightPlacement: function () {
        for (let i = 0; i < this.boardHeight; i++) {
          this.$set(this.addShips.board, i, new Array(this.boardWidth));
        }
      },

      addShipHighlightPlacement: function (x, y) {
        let shipLength = this.boardShips[this.addShips.currentShipIndex];
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
            } else {
              this.addShips.board[i][j] = "valid";
            }            
          }
        }
      },

      addShipSavePlacement: function (x, y) {
        let shipLength = this.boardShips[this.addShips.currentShipIndex];
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

        // Placement is invalid
        if (y + height > this.boardHeight || x + width > this.boardWidth) {
          return;
        }

        this.myShips.push({
          width: width,
          height: height,
          x: x,
          y: y
        });

        this.addShips.currentShipIndex++;
        
      }
    },
    
    computed: {
      myShipsBoard: function () {
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
            for(let j = x; j < x + width, this.boardWidth; j++) {
              board[i][j] = shipIndex;
            }
          }

        }
      }
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
