/* eslint-disable */
var widgetId = parseInt(Fliplet.Widget.getDefaultId(), 10);
var data = Fliplet.Widget.getData(widgetId) || {};
var $folderContents = $('.file-table-body');
var $organizationList = $('.dropdown-menu-holder .panel-group');
var $progress = $('.progress');
var $progressBar = $progress.find('.progress-bar');
var $dropZone = $('#drop-zone');
var templates = {
  file: template('file'),
  folder: template('folder'),
  organizations: template('organizations'),
  apps: template('apps'),
  moveModal: template('move-modal'),
  organizationsSelect: template('select-organizations'),
  appsSelect: template('select-apps'),
  moveModalFolders: template('move-modal-folders')
};

// This should contain either app/org/folder of current folder
var currentSelection;

var currentFolderId;
var currentAppId;
var currentFolders;
var currentFiles;
var counterOrganization;
var foldersForMoving = {};
foldersForMoving.navStack = [];
var selectedItemsForMoving;

var tetherBox;

var folders = [];
var appsList;
var organizationsList;
var navStack = [];

var sideBarMinWidth = 240;
var sideBarMaxWidth = 395;

// Keep it as false because people copy this URL and use it into their apps,
// therefore we want this to be an clean direct link to the API with no token.
var useCdn = false;

Handlebars.registerHelper({
  eq: function (v1, v2) {
    return v1 === v2;
  },
  gt: function (v1, v2) {
    return v1 > v2;
  }
});

// CORE FUNCTIONS //
// Get organizations and apps list for left side menu
function getOrganizationsList() {
  counterOrganization = 0;
  Fliplet.Organizations.get().then(function(organizations) {
    // Sort alphabetically
    organizationsList = _.sortBy(organizations, [function(o) {
      return o.name;
    }]);
    // Add to HTML
    organizationsList.forEach(addOrganizations);
  }).then(function() {
    getAppsList();
  });
}

function parseThumbnail(file) {
  if (file.thumbnail) {
    return;
  }

  file.thumbnail = Fliplet.Media.authenticate(file.url.replace(Fliplet.Env.get('apiUrl'), Fliplet.Env.get('apiCdnUrl')));
}

function navigateToDefaultFolder() {
  if (typeof data === 'undefined' || !data || !data.appId) {
    // No folder was specified
    return;
  }

  var $listHolder;
  var folderId;
  var type;
  var $el = $('[data-app-id="' + data.appId + '"][data-browse-folder]');

  // Activate folder on left sidebar
  if ($el.data('type') === 'organization') {
    $listHolder = $el;
  } else {
    $listHolder = $el.find('.list-holder');
  }

  $('.dropdown-menu-holder').find('.list-holder.active').removeClass('active');
  $listHolder.first().addClass('active');

  // Set first folder of breadcrumbs
  resetUpTo($el);

  if (data.navStack && data.folder) {
    // Updates navStack with folders before the selected one
    var newNavStack = data.navStack.upTo.slice(1);
    newNavStack.forEach(function(obj, idx) {
      navStack.push(obj);
    });

    // Updates navStack with selected folder
    navStack.push(data.folder);
    navStack.forEach(function(obj, idx) {
      if (idx !== 0) {
        obj.back = function() {
          getFolderContentsById(obj.id);
        }
      }
    });

    folderId = data.folder.id;
    type = 'folder';
    updatePaths();
  } else {
    folderId = data.appId;
    type = 'app';
  }

  getFolderContentsById(folderId, type);
}

function getAppsList() {
  Fliplet.Apps.get().then(function(apps) {
    // Remove V1 apps
    apps.filter(function(app) {
      return !app.legacy;
    });
    // Sort apps alphabetically
    appsList = _.sortBy(apps, [function(o) {
      return o.name;
    }]);
    // Add apps to HTML
    appsList.forEach(addApps);

    navigateToDefaultFolder();
  });
}

function getFolderContentsById(id, type) {
  var options = {
    cdn: useCdn
  };

  var filterFiles = function(files) {
    return true
  };
  var filterFolders = function(folders) {
    return true
  };

  if (type === "app") {
    options.appId = id
    currentAppId = id
    currentFolderId = null;

    // Filter functions
    filterFiles = function(file) {
      return !file.mediaFolderId;
    };
    filterFolders = function(folder) {
      return !folder.parentFolderId;
    };
  } else {
    options.folderId = id;
    currentFolderId = id;
  }

  currentFolders = [];
  currentFiles = [];
  $folderContents.empty();

  Fliplet.Media.Folders.get(options).then(function(response) {
    var navItem = navStack[navStack.length-1];
    switch (navItem.type) {
      case 'organizationId':
        return;
      case 'appId':
        // User is no longer browsing the app folder
        if (!options.hasOwnProperty('appId') || parseInt(options.appId, 10) !== navItem.id) {
          return;
        }
        break;
      case 'folderId':
        // User is no longer browsing folder
        if (!options.hasOwnProperty('folderId') || parseInt(options.folderId, 10) !== navItem.id) {
          return;
        }
        break;
    }

    if (!$folderContents.is(':empty')) {
      // Content already rendered from a recent request. Do nothing.
      return;
    }

    if (response.files.length === 0 && response.folders.length === 0) {
      $('.empty-state').addClass('active');
    } else {
      folders = response.folders;

      // Filter only the files from that request app/org/folder
      var mediaFiles = response.files.filter(filterFiles);
      var mediaFolders = response.folders.filter(filterFolders);

      mediaFiles.forEach(parseThumbnail);

      mediaFolders.forEach(addFolder);
      mediaFiles.forEach(addFile);
    }
  }, function() {
    $('.empty-state').addClass('active');
  });
}

// Get folders and files depending on ID (Org, App, Folder) to add to the content area
function getFolderContents(el, isRootFolder) {
  if (isRootFolder) {
    // Restart breadcrumbs
    var $el = el;
    var $listHolder;

    if ($el.data('type') === 'organization') {
      $listHolder = $el;
    } else {
      $listHolder = $el.find('.list-holder');
    }

    $('.dropdown-menu-holder').find('.list-holder.active').removeClass('active');
    $listHolder.first().addClass('active');
  }

  var options = {
    cdn: useCdn
  };

  // Default filter functions
  var filterFiles = function(files) {
    return true
  };
  var filterFolders = function(folders) {
    return true
  };

  if (el.attr('data-type') === "app") {
    options.appId = el.attr('data-app-id');
    currentAppId = el.attr('data-app-id');
    currentFolderId = null;

    // Filter functions
    filterFiles = function(file) {
      return !file.mediaFolderId;
    };
    filterFolders = function(folder) {
      return !folder.parentFolderId;
    };
  } else if (el.attr('data-type') === "organization") {
    options.organizationId = el.attr('data-org-id');
    currentAppId = null;
    currentFolderId = null;

    // Filter functions
    filterFiles = function(file) {
      return !(file.appId || file.mediaFolderId);
    };
    filterFolders = function(folder) {
      return !(folder.appId || folder.parentFolderId);
    };
  } else {
    options.folderId = el.attr('data-id');
    currentFolderId = el.attr('data-id');
  }

  currentFolders = [];
  currentFiles = [];
  $folderContents.empty();

  Fliplet.Media.Folders.get(options).then(function(response) {
    var navItem = navStack[navStack.length-1];
    switch (navItem.type) {
      case 'organizationId':
        // User is no longer browsing the organization folder
        if (options.hasOwnProperty('folderId') || !options.hasOwnProperty('organizationId') || parseInt(options.organizationId, 10) !== navItem.id) {
          return;
        }
        break;
      case 'appId':
        // User is no longer browsing the app folder
        if (!options.hasOwnProperty('appId') || parseInt(options.appId, 10) !== navItem.id) {
          return;
        }
        break;
      case 'folderId':
        // User is no longer browsing the folder
        if (!options.hasOwnProperty('folderId') || parseInt(options.folderId, 10) !== navItem.id) {
          return;
        }
        break;
    }

    if (!$folderContents.is(':empty')) {
      // Content already rendered from a recent request. Do nothing.
      return;
    }

    if (response.files.length === 0 && response.folders.length === 0) {
      $('.empty-state').addClass('active');
    } else {
      folders = response.folders;

      // Filter only the files from that request app/org/folder
      var mediaFiles = response.files.filter(filterFiles);
      var mediaFolders = response.folders.filter(filterFolders);

      mediaFolders.forEach(addFolder);
      mediaFiles.forEach(addFile);

      mediaFiles.forEach(parseThumbnail);
    }
  }, function() {
    $('.empty-state').addClass('active');
  });
}

// Adds organization item template
function addOrganizations(organizations) {
  $organizationList.append(templates.organizations(organizations));

  if ($organizationList.find('.panel-title').length !== 1) {
    return;
  }

  $(".panel-collapse").first().collapse('show');
  var orgEl = $organizationList.find('.panel-title').first();
  var orgName = $organizationList.find('.panel-title').first().find('.list-text-holder span').first().text();

  $organizationList.find('.panel-title').first().addClass('active');

  // Store to nav stack
  backItem = {
    id: $organizationList.find('.panel-title').first().data('org-id'),
    name: orgName,
    tempElement: $organizationList.find('.panel-title').first()
  };
  backItem.back = function() {
    getFolderContents(backItem.tempElement);
  };
  backItem.type = 'organizationId';
  navStack.push(backItem);

  $('.header-breadcrumbs .current-folder-title').html('<span class="bread-link"><a href="#">' + orgName + '</a></span>');

  if (typeof data === 'undefined' || !data || !data.appId) {
    getFolderContents(orgEl);
  }
}

// Adds app item template
function addApps(apps) {
  var $appList = $('.dropdown-menu-holder #organization-' + apps.organizationId + ' .panel-body');
  $appList.append(templates.apps(apps));
}

// Adds folder item template
function addFolder(folder) {
  // Converts to readable date format
  var readableDate = moment(folder.updatedAt).format("Do MMM YYYY");
  folder.updatedAt = readableDate;

  currentFolders.push(folder);
  folders.push(folder);
  $folderContents.append(templates.folder(folder));
  $('.empty-state').removeClass('active');
}

// Adds file item template
function addFile(file) {
  // Converts to readable date format
  var readableDate = moment(file.updatedAt).format("Do MMM YYYY");
  file.updatedAt = readableDate;

  currentFiles.push(file);
  $folderContents.append(templates.file(file));
  $('.empty-state').removeClass('active');
}

// Templating
function template(name) {
  return Handlebars.compile($('#template-' + name).html());
}

function checkboxStatus() {
  var numberOfRows = $('.file-row').length;
  var numberOfActiveRows = $('.file-row.active').length;
  var fileURL = $('.file-row.active').data('file-url');
  $('.items-selected').html(numberOfActiveRows > 1 ? numberOfActiveRows + ' items' : numberOfActiveRows + ' item');

  if (numberOfRows === 0) {
    $('.empty-state').addClass('active');
  }

  if ($('.file-row').hasClass('active')) {
    $('.side-actions').addClass('active');
    $('.file-cell.selectable').addClass('active');
    $('.file-row').not(this).addClass('passive');
    $('.help-tips').addClass('hidden');
  } else {
    $('.side-actions').removeClass('active');
    $('.file-cell.selectable').removeClass('active');
    $('.file-row').not(this).removeClass('passive');
    $('.help-tips').removeClass('hidden');
    $('.side-actions .item').removeClass('show');
  }

  $('.side-actions .item').removeClass('show');
  $('.side-actions .item-actions').removeClass('single multiple');
  if (numberOfActiveRows > 1) {
    $('.side-actions .item.multiple').addClass('show');
    $('.side-actions .item-actions').addClass('multiple');
  } else if (numberOfActiveRows === 1) {
    var itemType = $('.file-row.active').data('file-type');
    $('.side-actions .item-actions').addClass('single');
    if (itemType === 'folder') {
      $('.side-actions .item.folder').addClass('show');
    } else if (itemType === 'image') {
      $('.side-actions .item.image').addClass('show');
      $('.side-actions .item.image').find('img').attr('src', fileURL);
    } else {
      $('.side-actions .item.file').addClass('show');
    }
  }

  if (numberOfRows === numberOfActiveRows) {
    $('.file-table-header input[type="checkbox"]').prop('checked', true);
  } else {
    $('.file-table-header input[type="checkbox"]').prop('checked', false);
  }
}

function toggleAll(el) {
  if (el.is(':checked')) {
    $('.file-row input[type="checkbox"]').each(function() {
      $(this).prop('checked', true);
      $(this).parents('.file-row').addClass('active');
      $(this).parents('.file-cell.selectable').addClass('active');
    });
  } else {
    $('.file-row input[type="checkbox"]').each(function() {
      $(this).prop('checked', false);
      $(this).parents('.file-row').removeClass('active');
      $('.file-cell.selectable').removeClass('active');
      $('.file-row').removeClass('passive');
    });
  }

  var numberOfActiveRows = $('.file-row.active').length;
  $('.items-selected').html(numberOfActiveRows > 1 ? numberOfActiveRows + ' items' : numberOfActiveRows + ' item');

  $('.side-actions .item').removeClass('show');
  $('.side-actions .item-actions').removeClass('single multiple');
  if (numberOfActiveRows > 1) {
    $('.side-actions .item.multiple').addClass('show');
    $('.side-actions .item-actions').addClass('multiple');
  } else if (numberOfActiveRows === 1) {
    $('.side-actions .item-actions').addClass('single');
  }

  if (!$('.file-row').hasClass('active')) {
    $('.side-actions').removeClass('active');
    $('.side-actions .item').removeClass('show');
    $('.help-tips').removeClass('hidden');
  }
}

function updatePaths() {
  if (navStack.length > 1) {
    var breadcrumbsPath = '';

    for (var i = 0; i < navStack.length; i++) {
      breadcrumbsPath += '<span class="bread-link"><a href="#" data-breadcrumb="' + i + '">' + navStack[i].name + '</a></span>';
    }

    $('.header-breadcrumbs .current-folder-title').html(breadcrumbsPath);
    return;
  }

  // Current folder
  $('.header-breadcrumbs .current-folder-title').html('<span class="bread-link"><a href="#">' + navStack[navStack.length - 1].name + '</a></span>');
}

function resetUpTo(element) {
  navStack = [];

  if (element.attr('data-type') === "app") {
    backItem = {
      id: element.data('app-id'),
      name: element.find('.list-text-holder span').first().text(),
      tempElement: element
    };
    backItem.type = 'appId';
  } else if (element.attr('data-type') === "organization") {
    backItem = {
      id: element.data('org-id'),
      name: element.find('.list-text-holder span').first().text(),
      tempElement: element
    };
    backItem.type = 'organizationId';
  } else {
    backItem = {
      id: element.data('id'),
      name: element.find('.list-text-holder span').first().text(),
      tempElement: element
    };
    backItem.type = 'folderId';
  }
  backItem.back = function() {
    getFolderContents(backItem.tempElement);
  };

  navStack.push(backItem);
  updatePaths();
}

function showDropZone() {
  $('.drop-zone-folder-name').html(navStack[navStack.length - 1].name);
  $dropZone.addClass('active');
}

function hideDropZone() {
  $dropZone.removeClass('active');
}

function uploadFiles(files) {
  var formData = new FormData();
  var file;
  for (var i = 0; i < files.length; i++) {
    file = files.item(i);
    formData.append('name[' + i + ']', file.name);
    formData.append('files[' + i + ']', file);
  }

  $progressBar.css({
    width: '0%'
  });
  $progress.removeClass('hidden');

  Fliplet.Media.Files.upload({
    folderId: currentFolderId,
    appId: currentAppId,
    name: file.name,
    data: formData,
    progress: function(percentage) {
      $progressBar.css({
        width: percentage + '%'
      });
    }
  }).then(function(files) {
    files.forEach(function(file) {
      addFile(file);
    });

    $progress.addClass('hidden');
  });
}

// FUNCTIONS FOR MOVING FILES/FOLDERS IN MODAL

// Check if folder that has selected items to move has a subfolder and filter it
function excludeFolders(items) {
  var parentItemIdOfSelectedItems = navStack[navStack.length-1].id;
  var selectedIdPlaceInModal = foldersForMoving.navStack[foldersForMoving.navStack.length-1].id;
  var searchResult = items;
  var selectedIdForMoving = [];
  
  for (var i = 0; i < selectedItemsForMoving.length; i++) {
    if ($(selectedItemsForMoving[i]).attr('data-file-type') === 'folder') {
      selectedIdForMoving.push(Number($(selectedItemsForMoving[i]).attr('data-id')));
    }
  }
  
  if (parentItemIdOfSelectedItems === selectedIdPlaceInModal) {
    searchResult = searchResult.filter(function (item) {
      for (var i = 0; i < selectedIdForMoving.length; i++) {
        return item.id !== selectedIdForMoving[i];
      }
    })
  }
  
  return searchResult;
  
}

// Add app select item template
function addAppsToSelect(apps) {
  var $appSelectList = $('#organization-optgroup-' + apps.organizationId);
  $appSelectList.append(templates.appsSelect(apps));
}

// Create list of folders in modal
function addFoldersToMoveModal(res) {
  if (Array.isArray(res)) {
    if (res.length < 1) {
      $('.move-modal-empty-state').addClass('active');
    } else {
      res = _.sortBy(res, [function(o) {
        return o.name;
      }]);
      res.forEach(function (folder) {
        $('.move-modal-list').append(templates.moveModalFolders(folder));
      });
    }
  } else {
    $('.move-modal-list').append(templates.moveModalFolders(res));
    $('.move-modal-empty-state').removeClass('active');
  }
}

// Add organization select item template
function addOrganizationsToSelect(org) {
  var $organizationsSelectList = $('#move-model-organizations-select');
  $organizationsSelectList.append(templates.organizationsSelect(org));
  appsList.forEach(addAppsToSelect);
}

// Users selected folders tree (for breadcrumbs)
function addPathToStack(id, name, orgId, appId, parentId, type) {
  foldersForMoving['navStack'].push(
    {
      id: Number(id)?Number(id):null,
      name: name,
      organizationId: Number(orgId)?Number(orgId):null,
      appId: Number(appId)?Number(appId):null,
      parentId: Number(parentId)?Number(parentId):null,
      type: type
    }
    );
}

//Check if any folders exists
function checkExistsMovingFolders(id) {
  if (foldersForMoving.hasOwnProperty(id)) {
    return foldersForMoving[id];
  } else {
    return false;
  }
}

//Function for creating breadcrumbs
function createMoveModalBreadCrumbsPaths() {
  if (foldersForMoving['navStack'].length >= 1) {
    var breadcrumbsPath = '';
    
    for (var i = 0; i < foldersForMoving['navStack'].length; i++) {
      breadcrumbsPath +=
        '<span class="bread-link">' +
        '<a href="#" ' +
        'data-breadcrumb-item ' +
        'data-breadcrumb="' + foldersForMoving['navStack'][i].id + '" ' +
        'data-breadcrumb-index="' + i + '" ' +
        'data-breadcrumb-type="' + foldersForMoving['navStack'][i].type + '"' +
        '>' + foldersForMoving['navStack'][i].name + '</a>' +
        '</span>';
    }
    
    $('#move-modal .current-folder-title').html(breadcrumbsPath);
  }
}

//Create array tree form search result
function createTreeFoldersArr(arr) {
  var currentArr = arr;
  
  function transformToTree(arr) {
    var nodes = {};
    return arr.filter(function(obj) {
      var id = obj["id"],
        parentId = obj["parentId"];
      
      nodes[id] = _.defaults(obj, nodes[id], { children: [] });
      parentId && (nodes[parentId] = (nodes[parentId] || { children: [] }))["children"].push(obj);
      
      return !parentId;
    });
  }
  return transformToTree(currentArr);
}

//Create and open move modal
function openMovePopup() {
  foldersForMoving['navStack'] = [];
  selectedItemsForMoving = $('.file-row.active');
  var objData = {
    items: selectedItemsForMoving,
    itemsLength: selectedItemsForMoving.length
  };
  $('.file-manager-wrapper').append(templates.moveModal(objData));
  $('#move-modal').modal('show');
  organizationsList.forEach(addOrganizationsToSelect);
  var $moveSelectPlaces = $('#move-model-organizations-select').find('option').first();
  var id = $moveSelectPlaces.attr('data-id');
  var type = $moveSelectPlaces.attr('data-type');
  var name = $moveSelectPlaces.val();
  addPathToStack(id, name, null, null, null, type);
  this.searchFolders(id, type);
}

//Function for opening children folders
function openChildrenFolders(folderId) {
  var folder;
  var folders = [];
  var id = $('#move-model-organizations-select').find(':selected').attr('data-id');
  
  foldersForMoving[id].forEach(function (currChild) {
    if (!!searchTree(currChild, folderId)) {
      folder = searchTree(currChild, folderId);
    }
    folder = searchTree(currChild, folderId);
  });
  
  folders = folder.children;
  $('.move-modal-list').html('');
  addFoldersToMoveModal(folders);
  createMoveModalBreadCrumbsPaths();
}

// Call method for searching folders for selected app/organization
function searchFolders(id, type) {
  var res;
  $('.move-modal-list').html('');
  if (checkExistsMovingFolders(id)) {
    res = checkExistsMovingFolders(id);
    addFoldersToMoveModal(res);
    createMoveModalBreadCrumbsPaths();
  } else {
    var filterFolders = function(folders) {
      return true
    };
    var body = {};
    if (type === "organizationId") {
      body.organizationId = id;
      filterFolders = function(folder) {
        return (!(folder.appId || folder.parentFolderId) && folder.type === 'folder');
      };
    } else if (type === "appId") {
      body.appId = id;
      filterFolders = function(folder) {
        return (!(folder.parentFolderId) && folder.type === 'folder');
      };
    }
    $('.move-modal-loading').addClass('visible');
    Fliplet.Media.Folders.search(body).then(function(response) {
      res = response.filter(filterFolders);
      res = createTreeFoldersArr(excludeFolders(res));
      foldersForMoving[id] = res;
      addFoldersToMoveModal(res);
      createMoveModalBreadCrumbsPaths();
      $('.move-modal-loading').removeClass('visible');
    });
  }
}

//Function for searching folders in array tree by id
function searchTree(currChild, searchString) {
  if (currChild.id == searchString){
    return currChild;
  } else if (currChild.children != null){
    var i;
    var result = null;
    for (i = 0; result == null && i < currChild.children.length; i++){
      result = searchTree(currChild.children[i], searchString);
    }
    return result;
  }
  return null;
}

$dropZone.on('drop', function(e) {
  e.preventDefault();
  hideDropZone();
  var dataTransfer = e.originalEvent.dataTransfer;
  var files = dataTransfer.files;
  if (!files.length) return hideDropZone();
  uploadFiles(files);
});

$dropZone.on('dragover', function(e) {
  e.preventDefault();
});

$dropZone.on('dragleave', function(e) {
  e.preventDefault();
  hideDropZone();
});

$('html').on('dragenter', function(e) {
  e.preventDefault();
  showDropZone();
});

// EVENTS //
// Removes options popup by clicking elsewhere
$(document)
  .on("click", function(e) {
    if ($(e.target).is(".new-menu") === false && $(e.target).is("ul") === false) {
      $('.new-menu').removeClass('active');
    }
  })
  .mouseup(function(e) {
    $(document).unbind('mousemove');
  });

$('.file-manager-wrapper')
  .on('change', '#file_upload', function() {
    var $form = $('[data-upload-file]');

    $form.submit();

    $('.new-btn').click();
  })
  .on('dblclick', '.file-table-body [data-browse-folder], .file-table-body [data-open-file]', function(event) {
    var $el = $(this);
    var $parent = $el.parents('.file-row');
    var id = $el.parents('.file-row').data('id');
    var backItem;

    // Remove any selected field
    $('.file-row input[type="checkbox"]').each(function() {
      $(this).prop('checked', false);
      $(this).parents('.file-row').removeClass('active');
      $('.file-cell.selectable').removeClass('active');
      $('.file-row').removeClass('passive');
    });
    // Hide side actions
    $('.side-actions').removeClass('active');
    $('.side-actions .item').removeClass('show');
    $('.help-tips').removeClass('hidden');

    if ($parent.data('file-type') === 'folder') {
      // Store to nav stack
      backItem = _.find(folders, ['id', id]);
      backItem.tempElement = $('.file-row[data-id="' + id + '"]');
      backItem.back = function() {
        getFolderContents(backItem.tempElement);
      };
      backItem.type = 'folderId';
      navStack.push(backItem);

      // Update paths
      updatePaths();
      getFolderContents($(this).parents('.file-row'));
    } else {
      var fileURL = $('.file-row[data-id="' + id + '"]').attr('data-file-url');

      if (fileURL !== undefined) {
        window.open(fileURL, '_blank');
      }
    }
  })
  .on('click', '.dropdown-menu-holder [data-browse-folder]', function(event) {
    resetUpTo($(this));
    getFolderContents($(this), true);
  })
  .on('click', '[data-create-folder]', function(event) {
    // Creates folder
    var isCreatingInModal = $(this).attr('data-create-folder-modal');
    var folderName = prompt('Type folder name');
    var lastFolderMainNavStack = navStack[navStack.length - 1];
    var lastFolderModalNavStack = foldersForMoving.navStack[foldersForMoving.navStack.length - 1];
    var lastFolderSelected;
    
    if (!isCreatingInModal) {
      lastFolderSelected = lastFolderMainNavStack;
    } else {
      lastFolderSelected = lastFolderModalNavStack;
    }

    var options = {
      name: folderName,
      parentId: currentFolderId || undefined
    };

    if (!folderName) {
      return;
    }
    
    if (lastFolderSelected.type === "appId") {
      options.appId = lastFolderSelected.id;
    } else if (lastFolderSelected.type === "organizationId") {
      options.organizationId = lastFolderSelected.id;
    } else {
      options.parentId = lastFolderSelected.id;

      if (lastFolderSelected.organizationId !== null) {
        options.organizationId = lastFolderSelected.organizationId;
      } else if (lastFolderSelected.appId !== null) {
        options.appId = lastFolderSelected.appId;
      }
    }
    console.log('lastFolderSelected', lastFolderSelected)
    Fliplet.Media.Folders.create(options).then( function (folder) {
      if (!isCreatingInModal) {
        addFolder(folder);
      } else if (lastFolderMainNavStack.id === lastFolderModalNavStack.id) {
        addFolder(folder);
      }
      if (isCreatingInModal) {
        folder.children = [];
        addFoldersToMoveModal(folder);
      }
    });
    if (!isCreatingInModal) {
      $('.new-btn').click();
    }
  })
  .on('submit', '[data-upload-file]', function(event) {
    // Upload file
    event.preventDefault();

    var formData = new FormData();
    var $form = $(this);
    var $input = $form.find('input');
    var files = $input[0].files;
    var file;

    for (var i = 0; i < files.length; i++) {
      file = files.item(i);
      formData.append('name[' + i + ']', file.name);
      formData.append('files[' + i + ']', file);
    }

    $progressBar.css({
      width: '0%'
    });
    $progress.removeClass('hidden');

    Fliplet.Media.Files.upload({
      folderId: currentFolderId,
      appId: currentAppId,
      name: file.name,
      data: formData,
      progress: function(percentage) {
        $progressBar.css({
          width: percentage + '%'
        });
      }
    }).then(function(files) {
      $input.val('');
      files.forEach(function(file) {
        addFile(file);
      });

      $progress.addClass('hidden');
    });
  })
  .on('change', '#sort-files', function() {
    var selectedValue = $(this).val();
    var selectedText = $(this).find("option:selected").text();
    $(this).parents('.select-proxy-display').find('.select-value-proxy').html(selectedText);
  })
  .on('click', '.new-btn', function(event) {
    $(this).next('.new-menu').toggleClass('active');

    event.stopPropagation();
  })
  .on('click', '.file-row > div:not(.selectable)', function() {
    $(this).parents('.file-table-body').find('.file-row.active input[type="checkbox"]').click();
    $(this).parents('.file-row').find('input[type="checkbox"]').click();
  })
  .on('change', '.file-row input[type="checkbox"]', function() {
    $(this).parents('.file-row').toggleClass('active');
    checkboxStatus();
  })
  .on('change', '.file-table-header input[type="checkbox"]', function() {
    toggleAll($(this));
  })
  .on('click', '[delete-action]', function() {
    var items = $('.file-row.active');

    var alertConfirmation = confirm("Are you sure you want to delete all selected items?\nAll the content inside a folder will be deleted too.");

    if (alertConfirmation === true) {
      $(items).each(function() {
        var $element = $(this);

        if ($element.attr('data-file-type') === 'folder') {
          Fliplet.Media.Folders.delete($element.attr('data-id')).then(function() {
            $element.remove();
            checkboxStatus();
          });
        } else {
          Fliplet.Media.Files.delete($element.attr('data-id')).then(function() {
            $element.remove();
            checkboxStatus();
          });
        }
      });
    }
  })
  .on('click', '[download-action]', function() {
    var items = $('.file-row.active'),
        context = navStack[navStack.length - 1],
        contextType = context.type,
        contextId = context.id,
        files,
        folders,
        params = '',
        contentToZip = {
          files: [],
          folders: []
        };

    $(items).each(function() {
      var $element = $(this);

      if ($element.attr('data-file-type') === 'folder') {
        contentToZip.folders.push($element.attr('data-id'));
      } else {
        contentToZip.files.push($element.attr('data-id'));
      }
    });

    if (contentToZip.files.length) {
      files = contentToZip.files.toString();
      params += '&files=' + files;
    }
    if (contentToZip.folders.length) {
      folders = contentToZip.folders.toString();
      params += '&folders=' + folders;
    }

    window.location.href = '/v1/media/zip?' + contextType + '=' + contextId + params;
  })
  .on('click', '[move-action]', function() {
    openMovePopup();
  })
  .on('click', '[open-action]', function() {
    // Open folder or file
    var itemID = $('.file-row.active').data('id');
    var fileURL = $('.file-row.active').data('file-url');

    if (fileURL !== undefined) {
      window.open(fileURL, '_blank');
    } else {
      $('.file-row.active').find('.file-name').dblclick();
    }
  })
  .on('click', '[rename-action]', function() {
    // Rename folder or file
    var itemID = $('.file-row.active').data('id');
    var itemType = $('.file-row.active').data('file-type');
    var fileName = $('.file-row[data-id="' + itemID + '"]').find('.file-name span').text();

    var changedName = prompt("Please enter the file name", fileName);

    if (changedName !== null) {
      if (itemType === "folder") {
        Fliplet.Media.Folders.update(itemID, {
          name: changedName
        }).then(function() {
          $('.file-row[data-id="' + itemID + '"]').find('.file-name span').html(changedName);
        });
      } else {
        Fliplet.Media.Files.update(itemID, {
          name: changedName
        }).then(function() {
          $('.file-row[data-id="' + itemID + '"]').find('.file-name span').html(changedName);
        });
      }
    }
  })
  .on('click', '.file-manager-body .header-breadcrumbs [data-breadcrumb]', function() {
    var index = $(this).data('breadcrumb');
    var position = index + 1;

    navStack.splice(position, 9999);
    navStack[index].back();
    updatePaths();
  })
  .on('show.bs.collapse', '.panel-collapse', function() {
    $(this).siblings('.panel-heading').find('.fa').addClass('rotate');
  })
  .on('hide.bs.collapse', '.panel-collapse', function() {
    $(this).siblings('.panel-heading').find('.fa').removeClass('rotate');
  })
  .on('hidden.bs.modal', '#move-modal', function() {
    $(this).remove();
    foldersForMoving = {};
  })
  .on('change', '#move-model-organizations-select', function() {
    $('.move-modal-empty-state').removeClass('active');
    $('[data-move-button]').attr('disabled');
    foldersForMoving['navStack'] = [];
    var type = $(this).find(":selected").attr('data-type');
    var id = $(this).find(":selected").attr('data-id');
    var name = $(this).find(":selected").val();
    addPathToStack(id, name, null, null, null, type);
    searchFolders(id, type);
  })
  .on('click', '[data-move-folder]', function() {
    if (!$(this).hasClass('children')) {
      $('[data-move-folder]').removeClass('selected');
      $(this).toggleClass('selected');
    } else {
      addPathToStack(
        $(this).attr('data-folder-id'),
        $(this).text(),
        $(this).attr('data-org-id'),
        $(this).attr('data-app-id'),
        $(this).attr('data-parent-id'),
        'folder');
      openChildrenFolders($(this).attr('data-folder-id'));
    }
    $('[data-move-button]').removeAttr('disabled');
  })
  .on('click', '[data-breadcrumb-item]', function() {
    $('.move-modal-empty-state').removeClass('active');
    var index = Number($(this).attr('data-breadcrumb-index'));
    var id = $(this).attr('data-breadcrumb');
    var type = $(this).attr('data-breadcrumb-type');
    if (index !== foldersForMoving['navStack'].length - 1) {
      $('.move-modal-list').html('');
      foldersForMoving['navStack'].splice(index + 1, foldersForMoving['navStack'].length - 1 - index);
      if (type === 'organizationId' || type === 'appId') {
        addFoldersToMoveModal(foldersForMoving[id]);
      } else {
        openChildrenFolders(id);
      }
      createMoveModalBreadCrumbsPaths();
    }
  })
  .on('click', '[data-move-button]', function() {
    var $selectedPlace = $('.move-modal-list .selected');
    var appId;
    var orgId;
    var folderId;
    
    if ($selectedPlace.length) {
      appId = Number($selectedPlace.attr('data-app-id'));
      orgId = Number($selectedPlace.attr('data-org-id'));
      folderId = Number($selectedPlace.attr('data-folder-id'));
    } else {
      var $selectedOption = $('#move-model-organizations-select').find(':selected');
      var type = $selectedOption.attr('data-type');
      if (type === 'organizationId') {
        appId = null;
        orgId = Number($selectedOption.attr('data-id'));
      } else {
        appId = Number($selectedOption.attr('data-id'));
        orgId = null;
      }
      folderId = null;
    }
    
    appId = appId ? appId : null;
    orgId = orgId ? orgId : null;
    folderId = folderId ? folderId : null;
    var updateMethod;
    
    $('#move-modal').modal('hide');
    
    $(selectedItemsForMoving).each(function(index) {
      var $element = $(this);
      
      $element.addClass('moving');
      $element.removeClass('active');
      
      if ($element.attr('data-file-type') === 'folder') {
        updateMethod = Fliplet.Media.Folders.update(
          Number($element.attr('data-id')), {
            appId: appId,
            parentId: folderId,
            organizationId: orgId
          }
        )
      } else {
        updateMethod = Fliplet.Media.Files.update(
          Number($element.attr('data-id')), {
            appId: appId,
            mediaFolderId: folderId,
            organizationId: orgId
          }
        )
      }
      
      updateMethod.then(function() {
        checkboxStatus();
        if (selectedItemsForMoving.length - 1 === index) {
          $(selectedItemsForMoving).remove();
        }
      });
      
    });
  });
/* Resize sidebar
.on('mousedown', '.split-bar', function(e) {
  e.preventDefault();
  $(document).mousemove(function(e) {
    e.preventDefault();
    var x = e.pageX - $('.file-manager-leftside').offset().left;
    if (x > sideBarMinWidth && x < sideBarMaxWidth) {
      $('.file-manager-leftside').css("width", x);
    }
  });
});
*/

// INIT //
getOrganizationsList();
