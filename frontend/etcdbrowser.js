var app = angular.module("app", [
    "xeditable",
    "mc.resizer",
    "ui.bootstrap",
    "ang-drag-drop",
    "pageslide-directive",
    "blockUI"
]);

app.factory('AsyncPut', function ($q, $http) {
  var put = function(url, params) {
    var deferred = $q.defer();

    console.debug(url);
    $http({method: 'PUT', url: url, params: params})
    .then(function() {
      deferred.resolve();
    })

    return deferred.promise;
  }

  return {
    put: put
  };
});

app.controller('NodeCtrl', [
        '$scope', '$http', '$location', '$q', '$uibModal', '$log', 'AsyncPut', '$timeout', 'blockUI',
        function($scope, $http, $location, $q, $uibModal, $log, AsyncPut, $timeout, blockUI) {
  var keyPrefix = '/v2/keys',
      statsPrefix = '/v2/stats';

  $scope.urlPrefix = $location.search().etcd || $location.protocol() + "://" + document.location.host;
  $scope.new_item = {
    name: '',
    value: '',
    isDir: false,
    node: null
  };

  $scope.slideOpen = false;

  $scope.toggleSlide = function () {
      $scope.slideOpen = !$scope.slideOpen;
  }

  $scope.getPrefix = function() {
    if ($scope.urlPrefix) {
      var splitted = $scope.urlPrefix.split("/");
      return splitted[0] + "//" + splitted[2]
    }
    return ''
  }


  $scope.setActiveNode = function(node) {
    $scope.activeNode = node;
    if (node.open) {
      console.log('setActiveNode node open')
      $scope.loadNode(node);
    } else {
      console.log('setActiveNode node closed')
      $scope.toggleNode(node);
    }
  }

  function keyErrorHandler(data, url){
    var message = data;
    if(data.message) {
      message = data.message;
    }
    $scope.error = "Request failed - " + message + " - " + url;
  }

  function errorHandler(data, status, headers, config){
    var message = data;
    if(data.message) {
      message = data.message;
    }
    $scope.error = "Request failed - " + message + " - " + config.url;
    $scope.loading = false;
  }

  $scope.loadNode = function(node){
    console.log('enter: scope.loadNode ' + node.key);
    delete $scope.error;
    $scope.loading = true;
    var url = $scope.getPrefix() + keyPrefix + node.key;
    $http({method: 'GET', url: url})
    .then(function(http_data) {
        $timeout(function() {
            console.log('then: scope.loadNode ' + node.key);
            var data = http_data.data;
            if (! angular.isDefined(data.node)) {
                keyErrorHandler(data, url);
            } else {
                prepNodes(data.node.nodes, node);
                node.nodes = data.node.nodes;
                $scope.urlPrefix = $scope.getPrefix() + keyPrefix + node.key
            }
            var root = $scope.root;
            var tree_node = findNode(root, node.key);
            console.log('loadNode findNode');
            console.log(tree_node);

            $scope.loading = false;
            $scope.$apply(function (){
                $scope.root = root;
            });
        });
      });
    console.log('exit: scope.loadNode ' + node.key);
  }

  $scope.toggleNode = function(node) {
    node.open = !node.open;
    if (node.open) {
      $scope.loadNode(node);
    } else {
      node.nodes = [];
    }
  };
  $scope.hasProperties = function(node){
    for(var key in node.nodes){
      if(!node.nodes[key].dir){
        return true;
      }
    }
  }

  $scope.submit = function(){
    var splitted = $scope.urlPrefix.split("/");
    // var etcd = splitted[0] + "//" + splitted[2];
    // if (etcd !== $location.protocol() + "://" + document.location.host === !$location.search().etcd) {
    //   $location.search('etcd', etcd);
    // }
    $scope.root = {
        key: '/' + splitted.slice(5).join('/'),
        name: splitted.slice(-1)
    }
    delete $scope.activeNode;
    $scope.loadNode($scope.root);
  }

  $scope.setRoot = function () {
    $scope.modalNewItem({
        title: 'Set tree root',
        firstInput: {
            label: 'To',
            value: $scope.urlPrefix
        },
        secondInput: {},
        isDir: true,
        node: null
    }, function() {
        $scope.urlPrefix = $scope.new_item.firstInput.value;
        $scope.submit();
    });
  }

  $scope.resetRoot = function () {
    $scope.root = {
        key: '/',
        name: '/'
    }
    delete $scope.activeNode;
    $scope.loadNode($scope.root);
  }

  $scope.addNode = function(node){
    $scope.modalNewItem({
        title: 'New Key/Value pair for node ' + node.key,
        firstInput: {
            label: 'Name',
            value: ''
        },
        secondInput: {
            label: 'Value',
            value: ''
        },
        isDir: false,
        node: node
    }, function() {
        var name = $scope.new_item.firstInput.value;
        var value = $scope.new_item.secondInput.value;
        var node = $scope.new_item.node;

        if (!name || name == "") return;

        $http({method: 'PUT',
               url: $scope.getPrefix() + keyPrefix + node.key + (node.key != "/" ? "/" : "") + name,
               params: {"value": value}}).
        success(function(data) {
          $scope.loadNode(node);
        }).
        error(errorHandler);
      });
  }

  $scope.checkboxModel = {
    use_json_validation : false
  };
  $scope.updateNode = function(node,value){
    if ($scope.checkboxModel.use_json_validation) {
      try {
        JSON.parse(value);
      } catch (err) {
        return 'Not a json';
      }
    }
    $http({method: 'PUT',
      url: $scope.getPrefix() + keyPrefix + node.key,
      params: {"value": value}}).
    success(function(data) {
      $scope.loadNode(node);
    }).
    error(errorHandler);
  }

  $scope.renameNode = function(node,keyName){
    var newkey = node.key.slice(0, node.key.lastIndexOf('/')+1) + keyName;
    if (newkey == node.key) {
       return;
    }
    var d = $q.defer();
    var reject = function(e) {
      d.reject('Server Error');
    }
    $http({method: 'GET', url: $scope.getPrefix() + keyPrefix + node.key}).
      success(function(data) {
        if (data.node.value != node.value) {
          d.resolve('The value has changed by someone else');
          return
        }
        $http({method: 'PUT',
               url: $scope.getPrefix() + keyPrefix + newkey,
               params: {"value": node.value}}).
          success(function(data) {
            $http({method: 'GET', url: $scope.getPrefix() + keyPrefix + node.key}).
              success(function(data) {
                if (data.node.value != node.value) {
                  $http({method: 'DELETE', url: $scope.getPrefix() + keyPrefix + newkey}).
                    success(function(data) {
                      d.resolve('The value has changed by someone else');
                    }).
                    error(reject);
                } else {
                  $http({method: 'DELETE', url: $scope.getPrefix() + keyPrefix + node.key}).
                    success(function(data) {
                      $scope.loadNode(node.parent);
                      d.resolve();
                    }).
                    error(reject);
                }
              }).
              error(reject);
          }).
          error(reject);
      }).
      error(reject);
    return d.promise;
  }

  $scope.deleteNode = function(node){
    $http({method: 'DELETE', url: $scope.getPrefix() + keyPrefix + node.key}).
    success(function(data) {
      $scope.setActiveNode(node.parent);
    }).
    error(errorHandler);
  }

  $scope.copyNode = function(node){
    var dirName = prompt("Copy property to directory","/");
    if(!dirName || dirName == "") return;
    dirName = $scope.formatDir(dirName);
    $http({method: 'PUT',
      url: $scope.getPrefix() + keyPrefix + dirName + node.name,
      params: {"value": node.value}}).
    error(errorHandler);
  }

  $scope.createDir = function(node){
    $scope.modalNewItem({
        title: 'New Node under ' + node.key,
        firstInput: {
            label: 'Name',
            value: ''
        },
        secondInput: {},
        isDir: true,
        node: node
    }, function() {
        var dirName = $scope.new_item.firstInput.value;
        if (!dirName || dirName == "") return;

        var node = $scope.new_item.node;
        $http({method: 'PUT',
          url: $scope.getPrefix() + keyPrefix + node.key + (node.key != "/" ? "/" : "") + dirName,
          params: {"dir": true}}).
        success(function(data) {
          $scope.loadNode(node);
        }).
        error(errorHandler);
      }
    );
  }

  $scope.renameDirAsync = function(source, from, target) {
    var new_key = source.key.replace(from, target);
    new_key = new_key.substr(1, new_key.length);
    var url = $scope.getPrefix() + keyPrefix + '/' + new_key;
    if (angular.isDefined(source.dir) && source.dir) {
        var param = {dir: true};
    } else {
        var param = {value: source.value};
    }
    return AsyncPut.put(url, param)
    .then(function () {
        if (angular.isDefined(source.nodes) && source.nodes.length > 0) {
          return $q.all(source.nodes.map(function (child) {
              return $scope.renameDirAsync(child, from, target);
          }));
        }
    });
  }

  $scope.copyDirAux = function(source, target){
    source.name = source.key.substring(source.key.lastIndexOf("/")+1);
    if (target.substr(target.trim().length - 1) != '/') {
      target += '/';
    }
    var url = $scope.getPrefix() + keyPrefix + target + source.name;

    if (angular.isDefined(source.dir) && source.dir) {
        var param = {dir: true};
    } else {
        var param = {value: source.value};
    }
    return AsyncPut.put(url, param)
    .then(function(){
        if (angular.isDefined(source.nodes) && source.nodes.length > 0) {
          return $q.all(source.nodes.map(function (child) {
              console.log('copyDirAux(chilld=' + child.key + ', target=' + target + source.name + ')')
              return $scope.copyDirAux(child, target + source.name);
          }));
        }
    });
  }

  $scope.copyDir = function(node){
    $scope.modalNewItem({
        title: 'Copy Node from ' + node.key,
        firstInput: {
            label: 'To',
            value: ''
        },
        secondInput: {},
        isDir: true,
        node: node
    }, function() {
        var dirName = $scope.new_item.firstInput.value;
        var node = $scope.new_item.node;

        if(!dirName || dirName == "") return;

        $scope.copyDirAux(node, dirName)
        .then(function (){
            $scope.setActiveNode(node.parent);
        });
      }
    );
  }

  // TODO: handle old style - merge on copy
  // TODO: handle move
  $scope.copyDirDrop = function(event, source, target){
    var dirname = target.key;

    if(!dirname || dirname == "") return;

    blockUI.start("Moving trees...");
    dirname = $scope.formatDir(dirname);
    var verifyUrl = $scope.getPrefix() + keyPrefix + source.key + "?dir=true&recursive=true";
    $http({method: 'GET', url: verifyUrl})
    .then(function(http_data) {
        $scope.copyDirAux(http_data.data.node, dirname)
        .then(function() {
          $scope.setActiveNode(target);
          $scope.$apply(function () {
            blockUI.stop();
          });
        });
    });
  }

  $scope.renameDir = function(node){
    return $scope.modalNewItem({
        title: 'Rename node from ' + node.name,
        firstInput: {
            label: 'to',
            value: node.name
        },
        secondInput: {},
        isDir: true,
        node: node
    }, function() {
      var target = $scope.new_item.firstInput.value;
      if(!target || target == "") return;

      var node = $scope.new_item.node;
      var new_node = angular.copy(node);
      new_node.name = target
      new_node.key = node.key.replace(node.name, target)
      new_node.parent.open = false;

      var url = $scope.getPrefix() + keyPrefix + node.key + "?dir=true&recursive=true"
      $http({method: 'GET', url: url})
      .then(function (wholeTree){
        return $scope.renameDirAsync(wholeTree.data.node, node.name, target)
        .then(function() {
          $scope.deleteDir(node, true);
          // $scope.loadNode(new_node);
          $scope.activeNode = new_node;
          $scope.toggleNode(new_node.parent);
        });
      });
    });
  }

  $scope.renameDirInPlace = function(node, target){
    if(!target || target == "") return;

    if (target == node.name) {
       return;
    }

    var new_node = angular.copy(node);
    new_node.name = target
    new_node.key = node.key.replace(node.name, target)
    new_node.parent.open = false;

    var url = $scope.getPrefix() + keyPrefix + node.key + "?dir=true&recursive=true";
    $http({method: 'GET', url: url})
    .then(function (wholeTree){
      console.log('renameDirInPlace before renameDirAsync')
      $scope.renameDirAsync(wholeTree.data.node, node.name, target)
      .then(function() {
        console.log('renameDirInPlace in then.renameDirAsync')
        $scope.deleteDir(node, true);
        console.log('renameDirInPlace old dir deleted')
        $scope.loadNode(new_node.parent);
        $scope.setActiveNode(new_node.parent);
        // $scope.apply(function() {
        //     $scope.activeNode = new_node.parent;
        // });
        console.log('renameDirInPlace after setActiveNode')
        // $scope.toggleNode(new_node.parent);
      });
    });
    console.log('renameDirInPlace exit')
    return false;
  }

  $scope.deleteDir = function(node, dontAsk) {
    if (typeof dontAsk == 'undefined') {
      if(!confirm("Are you sure you want to delete " + node.key)) return;
    }
    $http({method: 'DELETE',
      url: $scope.getPrefix() + keyPrefix + node.key + "?dir=true&recursive=true"})
    .then(function(data) {
      $scope.setActiveNode(node.parent);
    });
  }

  $scope.formatDir = function(dirName){
    if(dirName.substr(dirName.trim().length - 1) != '/'){
      dirName += '/';
    }
    return dirName;
  }

  $scope.submit();

  function prepNodes(nodes, parent){
    for(var key in nodes){
      var node = nodes[key];
      var name = node.key.substring(node.key.lastIndexOf("/")+1);
      node.name = name;
      node.parent = {
        name: parent.name,
        key: parent.key,
        open: parent.open
      }
    }
  }

  function findNode(root_node, key) {
    if (root_node.key == key) {
      return root_node;
    }
    if (!angular.isDefined(root_node.nodes)) {
      return null;
    }
    root_node.nodes.forEach(function(node) {
      var found_node = findNode(node, key);
      if (found_node != null) {
        return found_node;
      }
    });
    return null;
  }

  $scope.loadStats = function(){
    console.log("LOAD STATS");
    $scope.stats = {};
    $http({method: 'GET', url: $scope.getPrefix() + statsPrefix + "/store"}).
    success(function(data) {
      $scope.stats.store = JSON.stringify(data, null, " ");
    }).
    error(errorHandler);
    delete $scope.storeStats;
    $http({method: 'GET', url: $scope.getPrefix() + statsPrefix + "/leader"}).
    success(function(data) {
      $scope.stats.leader = JSON.stringify(data, null, " ");
    }).
    error(errorHandler);
    delete $scope.storeStats;
    $http({method: 'GET', url: $scope.getPrefix() + statsPrefix + "/self"}).
    success(function(data) {
      $scope.stats.self = JSON.stringify(data, null, " ");
    }).
    error(errorHandler);
  }

  $scope.modalNewItem = function (item, onPromise) {
    $scope.new_item = item;
    var modalInstance = $uibModal.open({
      templateUrl: 'modal-dialog.html',
      controller: 'ModalInstanceCtrl',
      resolve: {
        new_item: function () {
          return $scope.new_item;
        }
      }
    });

    modalInstance.result.then(function (new_item) {
        onPromise();
    }, function () {
        // dismissed - do nothing
    });

    return modalInstance.result;
  }

}]);

app.filter('prettyJson', function () {
    function ppJson(json) {
        return JSON ? JSON.stringify(json, null, '  ') : 'your browser doesnt support JSON so cant pretty print';
    }
    return ppJson;
});

app.run(function(editableOptions, editableThemes) {
  editableThemes.bs3.inputClass = 'input-sm';
  editableThemes.bs3.buttonsClass = 'btn-sm';
  editableOptions.theme = 'bs3';
});

app.controller('ModalInstanceCtrl', function ($scope, $uibModalInstance, new_item) {
    $scope.new_item = new_item;

    $scope.newItemOk = function () {
      $uibModalInstance.close($scope.new_item);
    };

    $scope.newItemCancel = function () {
      $uibModalInstance.dismiss('cancel');
    };
});

