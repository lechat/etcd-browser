var app = angular.module("app", [
    "xeditable",
    "mc.resizer",
    "ui.bootstrap",
    "ang-drag-drop"
]);

app.controller('NodeCtrl', [
        '$scope','$http','$location','$q', '$uibModal', '$log',
        function($scope,$http,$location,$q, $uibModal, $log) {
  var keyPrefix = '/v2/keys',
      statsPrefix = '/v2/stats';

  $scope.urlPrefix = $location.search().etcd || $location.protocol() + "://" + document.location.host;
  $scope.new_item = {
    name: '',
    value: '',
    isDir: false,
    node: null
  };

  $scope.getPrefix = function() {
    if ($scope.urlPrefix) {
      var splitted = $scope.urlPrefix.split("/");
      return splitted[0] + "//" + splitted[2]
    }
    return ''
  }


  $scope.setActiveNode = function(node) {
    $scope.activeNode = node;
    if(!node.open){
      $scope.toggleNode(node);
    }else{
      $scope.loadNode(node);
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
    delete $scope.error;
    $scope.loading = true;
    var url = $scope.getPrefix() + keyPrefix + node.key;
    $http({method: 'GET', url: url}).
      success(function(data) {
        if (! angular.isDefined(data.node)) {
            keyErrorHandler(data, url);
        } else {
            prepNodes(data.node.nodes,node);
            node.nodes = data.node.nodes;
            $scope.urlPrefix = $scope.getPrefix() + keyPrefix + node.key
        }
        $scope.loading = false;
      }).
      error(errorHandler);
  }

  $scope.toggleNode = function(node) {
    node.open = !node.open;
    if(node.open){
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
        name: '',
        value: '',
        isDir: false,
        node: node,
        title: 'New Key/Value pair for node ' + node.key,
        nameTitle: 'Name',
        op: 'addPair'
    }, function() {
        var name = $scope.new_item.name;
        var value = $scope.new_item.value;
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
      $scope.loadNode(node.parent);
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
        name: '',
        value: '',
        isDir: true,
        node: node,
        title: 'New Node under ' + node.key,
        nameTitle: 'Name',
        op: 'addDir'
    }, function() {
        if (!$scope.new_item.name || $scope.new_item.name == "") return;
        var dirName = $scope.new_item.name;
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

  $scope.copyDirAux = function(node, tarjet){
    $http({method: 'GET', url: $scope.getPrefix() + keyPrefix + node.key}).
      success(function(data) {
        prepNodes(data.node.nodes,node);
        node.nodes = data.node.nodes;
        for(var key in node.nodes){
          if (node.nodes[key].dir) {
            $scope.copyDirAux(node.nodes[key], tarjet + node.nodes[key].name + "/")
          } else {
            var url = $scope.getPrefix() + keyPrefix + tarjet + node.nodes[key].name
            $http({method: 'PUT',
              url: url,
              params: {"value": node.nodes[key].value}}).
            error(errorHandler);
          }
        }
      }).
      error(errorHandler);
  }

  $scope.copyDir = function(node){
    $scope.modalNewItem({
        name: node.key,
        value: '',
        isDir: true,
        node: node,
        op: 'copyDir',
        title: 'Copy Node from ' + node.key,
        nameTitle: 'To'
    }, function() {
        var dirName = $scope.new_item.name;
        var node = $scope.new_item.node;

        if(!dirName || dirName == "") return;
        dirName = $scope.formatDir(dirName);
        $scope.copyDirAux(node, dirName)
      }
    );
  }

  $scope.copyDirDrop = function(event, source, target){
    return $scope.modalNewItem({
        name: target.key,
        value: '',
        isDir: true,
        node: source,
        op: 'copyDir',
        title: 'Copy Node from ' + source.key,
        nameTitle: 'To'
    }, function() {
        var dirName = $scope.new_item.name;
        var node = $scope.new_item.node;

        if(!dirName || dirName == "") return;
        dirName = $scope.formatDir(dirName);
        $scope.copyDirAux(node, dirName)
        $scope.loadNode(target);
        $scope.setActiveNode(target);
      }
    );
  }

  $scope.deleteDir = function(node) {
    if(!confirm("Are you sure you want to delete " + node.key)) return;
    $http({method: 'DELETE',
      url: $scope.getPrefix() + keyPrefix + node.key + "?dir=true&recursive=true"}).
    success(function(data) {
      $scope.loadNode(node.parent);
    }).
    error(errorHandler);
  }

  $scope.formatDir = function(dirName){
    if(dirName.substr(dirName.trim().length - 1) != '/'){
      dirName += '/';
    }
    return dirName;
  }

  $scope.submit();

  function prepNodes(nodes,parent){
    for(var key in nodes){
      var node = nodes[key];
      var name = node.key.substring(node.key.lastIndexOf("/")+1);
      node.name = name;
      node.parent = parent;
    }
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

