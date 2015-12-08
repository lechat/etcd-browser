
var app = angular.module("app", ["xeditable", "mc.resizer"]);

app.controller('NodeCtrl', ['$scope','$http','$location','$q', function($scope,$http,$location,$q) {
  var keyPrefix = '/v2/keys',
      statsPrefix = '/v2/stats';

  $scope.readonly = false;

  $scope.confed = {
      state: null,
      username: localStorage.getItem('username'),
      password: null,
      url: null,//confed-url
      changeset: null,
      changeset_url: null,
      commitmsg: null,
      login_callback:null
  };

  $scope.urlPrefix = $location.search().etcd || $scope.confed.url || $location.protocol() + "://" + document.location.host;

  $scope.getPrefix = function() {
    if ($scope.urlPrefix) {
      var splitted = $scope.urlPrefix.split("/");
      return splitted[0] + "//" + splitted[2]
    }
    return ''
  }


  $scope.setActiveNode = function(node){
      if ($scope.activeNode == node) {
          $scope.toggleNode(node);
      } else {
          $scope.activeNode = node;
          if(!node.open){
              $scope.toggleNode(node);
          } else {
              $scope.loadNode(node);
          }
      }
  }

  function errorHandler(data, status, headers, config){
    var message = data;
    if (status === 403 && $scope.confed.url) {
      $scope.confed.state = 'login';
      $scope.confed.login_callback = null;
    }
    if(data.message) {
      message = data.message;
    }
    $scope.error = "Request failed - " + message + " - " + config.url;
  }

  $scope.loadNode = function(node){
    delete $scope.error;
    $http({method: 'GET', url: $scope.getPrefix() + keyPrefix + node.key, withCredentials: true}).
      success(function(data) {
        prepNodes(data.node.nodes,node);
          node.nodes = data.node.nodes;
        $scope.urlPrefix = $scope.getPrefix() + keyPrefix + node.key;
        if (node.key === "/") {
          $http({method: 'GET', url: $scope.getPrefix() + "/version", withCredentials: true}).
            success(function(data) {
               if (data.indexOf("confed") != -1 && $scope.confed.state === null) {
                   $scope.confed.state = "confed";
                   $scope.readonly = true;
               }
            }).
            error(errorHandler);
        }
      }).
      error(errorHandler);
  }

  $scope.toggleNode = function(node) {
    node.open = !node.open;
    if(node.open){
      $scope.loadNode(node);
    } else {
        if (node.nodes) {
            node.nodes = node.nodes.filter(function(n) { return !n.dir });
        } else {
            node.nodes = [];
        }
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
    if (!$scope.confed.url) {
        var splitted = $scope.urlPrefix.split("/");
        var etcd = splitted[0] + "//" + splitted[2];
        if (etcd !== $location.protocol() + "://" + document.location.host === !$location.search().etcd) {
          $location.search('etcd', etcd);
        }
    }
    $scope.root = {key:'/'};
    delete $scope.activeNode;
    $scope.loadNode($scope.root);
  }
  $scope.addNode = function(node){
    var name = prompt("Enter Property Name", "");
    var value = prompt("Enter Property value", "");
    if(!name || name == "") return;

    $http({method: 'PUT',
    	   url: $scope.getPrefix() + keyPrefix + node.key + (node.key != "/" ? "/" : "") + name,
    	   params: {"value": value},
           withCredentials: true}).
    success(function(data) {
      $scope.loadNode(node);
    }).
    error(errorHandler);
  };
  $scope.newNode = function(value){
    if ($scope.checkboxModel.use_json_validation) {
      try {
        JSON.parse(value);
      } catch (err) {
        return 'Not a json';
      }
    }
    $http({method: 'PUT',
    	   url: $scope.getPrefix() + keyPrefix + $scope.activeNode.key + ($scope.activeNode.key != "/" ? "/" : "") + $scope.activeNode.newkey.trim(),
    	   params: {"value": value},
           withCredentials: true}).
        success(function(data) {
            $scope.loadNode($scope.activeNode);
            $scope.activeNode.newkey = null;
        }).
        error(errorHandler);
  };

  $scope.checkboxModel = {
    use_json_validation : true
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
      params: {"value": value},
      withCredentials: true}).
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
    $http({method: 'GET', url: $scope.getPrefix() + keyPrefix + node.key, withCredentials: true}).
      success(function(data) {
        if (data.node.value != node.value) {
          d.resolve('The value has changed by someone else');
          return
        }  
        $http({method: 'PUT',
               url: $scope.getPrefix() + keyPrefix + newkey,
               params: {"value": node.value},
               withCredentials: true}).
          success(function(data) {
            $http({method: 'GET', url: $scope.getPrefix() + keyPrefix + node.key, withCredentials: true}).
              success(function(data) {
                if (data.node.value != node.value) {
                  $http({method: 'DELETE', url: $scope.getPrefix() + keyPrefix + newkey, withCredentials: true}).
                    success(function(data) {
                      d.resolve('The value has changed by someone else');
                    }).
                    error(reject);
                } else {
                  $http({method: 'DELETE', url: $scope.getPrefix() + keyPrefix + node.key, withCredentials: true}).
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
    $http({method: 'DELETE', url: $scope.getPrefix() + keyPrefix + node.key, withCredentials: true}).
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
      params: {"value": node.value},
      withCredentials: true}).
    error(errorHandler);
  }

  $scope.createDir = function(node){
    var dirName = prompt("Enter Directory Name", "");
    if(!dirName || dirName == "") return;
    $http({method: 'PUT',
      url: $scope.getPrefix() + keyPrefix + node.key + (node.key != "/" ? "/" : "") + dirName,
      params: {"dir": true},
      withCredentials: true}).
    success(function(data) {
      $scope.loadNode(node);
    }).
    error(errorHandler);
  }

  $scope.copyDirAux = function(node, tarjet){
    $http({method: 'GET', url: $scope.getPrefix() + keyPrefix + node.key, withCredentials: true}).
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
              params: {"value": node.nodes[key].value},
              withCredentials: true}).
            error(errorHandler);
          }
        }
      }).
      error(errorHandler);
  }

  $scope.copyDir = function(node){
    var dirName = prompt("Copy properties to directory", node.key);
    if(!dirName || dirName == "") return;
    dirName = $scope.formatDir(dirName);
    $scope.copyDirAux(node, dirName)
  }

  $scope.deleteDir = function(node) {
    if(!confirm("Are you sure you want to delete " + node.key)) return;
    $http({method: 'DELETE',
      url: $scope.getPrefix() + keyPrefix + node.key + "?dir=true&recursive=true",
        withCredentials: true}).
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
    $http({method: 'GET', url: $scope.getPrefix() + statsPrefix + "/store", withCredentials: true}).
    success(function(data) {
      $scope.stats.store = JSON.stringify(data, null, " ");
    }).
    error(errorHandler);
    delete $scope.storeStats;
    $http({method: 'GET', url: $scope.getPrefix() + statsPrefix + "/leader", withCredentials: true}).
    success(function(data) {
      $scope.stats.leader = JSON.stringify(data, null, " ");
    }).
    error(errorHandler);
    delete $scope.storeStats;
    $http({method: 'GET', url: $scope.getPrefix() + statsPrefix + "/self", withCredentials: true}).
    success(function(data) {
      $scope.stats.self = JSON.stringify(data, null, " ");
    }).
    error(errorHandler);
  }

  $scope.confedBeginEdit = function(){
      $http({method: 'POST', url: $scope.getPrefix() + "/changesets/", withCredentials: true}).
      success(function(data, status, headers, config) {
          if (!$scope.confed.url) {
              var splitted = $scope.urlPrefix.split("/");
              $scope.confed.url = splitted[0] + "//" + splitted[2];
          }
          $scope.confed.changeset = headers('Location').split('/')[2];
          $scope.confed.changeset_url = $scope.confed.url.replace('://', '://' + $scope.confed.changeset + '.');
          $scope.confed.state = 'editing';
          $scope.readonly = false;
          $scope.urlPrefix = $scope.urlPrefix.replace('://', '://' + $scope.confed.changeset + '.');
      }).
      error(function(data, status, headers, config){
          if (status === 403) {
              $scope.confed.state = 'login';
              $scope.confed.login_callback = $scope.confedBeginEdit;
          } else {
              return errorHandler(data, status, headers, config);
          }
      });      
  }

  $scope.confedLogin = function(){
      $http({method: 'POST', url: $scope.getPrefix() + "/login", 
             headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
             withCredentials: true,
             data: 'username=' + encodeURIComponent($scope.confed.username) + '&password='+ encodeURIComponent($scope.confed.password)}).
      success(function(data) {
          localStorage.setItem('username', $scope.confed.username);
          $scope.confed.password = null;
          if ($scope.confed.login_callback) {
              $scope.confed.login_callback();
          } else {
              $scope.confed.state = 'confed';
          }
      }).
      error(errorHandler);
  }

  $scope.confedCommit = function(){
      $http({method: 'POST', url: $scope.confed.url + "/changesets/" + $scope.confed.changeset, 
             headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
             withCredentials: true,
             data: 'author=' + encodeURIComponent($scope.confed.username) + '&message='+ encodeURIComponent($scope.confed.commitmsg)}).
      success(function(data) {
          $scope.urlPrefix = $scope.urlPrefix.replace('://' + $scope.confed.changeset + '.', '://');
          $scope.confed.commitmsg = null; 
          $scope.confed.changeset = null;
          $scope.confed.changeset_url = null;
          $scope.readonly = true;
          $scope.confed.state = 'confed';
          if ($scope.confed.changelog) {
              $scope.confedShowChangelog();
          }
          $scope.submit();
      }).
      error(errorHandler);
  }

  $scope.confedAbort = function(){
      $http({method: 'DELETE', url: $scope.confed.url + "/changesets/" + $scope.confed.changeset, 
             headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
             withCredentials: true}).
        success(function(data) {
          $scope.urlPrefix = $scope.urlPrefix.replace('://' + $scope.confed.changeset + '.', '://');
          $scope.confed.commitmsg = null;
          $scope.confed.changeset = null;
          $scope.confed.changeset_url = null;
          $scope.readonly = true;
          $scope.confed.state = 'confed';
          $scope.submit();
        }).
        error(errorHandler);
  }

  $scope.confedShowChangelog = function(){
      $http({method: 'GET', url: $scope.getPrefix() + "/changelog",
             withCredentials: true}).
      success(function(data) {
          $scope.confed.state = 'confed';
          $scope.confed.changelog = data;
      }).
      error(function(data, status, headers, config){
          if (status === 403) {
              $scope.confed.state = 'login';
              $scope.confed.login_callback = $scope.confedShowChangelog;
          } else {
              return errorHandler(data, status, headers, config);
          }
      });
  }

  $scope.confedHideChangelog = function(){
      $scope.confed.changelog = null;
  }
}]);

app.directive('ngEnter', function () {
    return function (scope, element, attrs) {
        element.bind("keydown keypress", function (event) {
            if(event.which === 13) {
                scope.$apply(function (){
                    scope.$eval(attrs.ngEnter);
                });

                event.preventDefault();
            }
        });
    };
});

app.run(function(editableOptions) {
  editableOptions.theme = 'bs3';
});
