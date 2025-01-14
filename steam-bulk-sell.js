// == Начало скрипта UI == //

// Создадим небольшой контейнер в правом нижнем углу
var microUI = document.createElement('div');
microUI.id = 'microSellUI';
microUI.style.position = 'fixed';
microUI.style.bottom = '10px';
microUI.style.right = '10px';
microUI.style.zIndex = '999999';            // чтобы быть поверх всего
microUI.style.background = 'rgba(0,0,0,0.8)';
microUI.style.color = 'white';
microUI.style.padding = '10px 10px';
microUI.style.borderRadius = '6px';
microUI.style.fontFamily = 'Arial, sans-serif';
microUI.style.fontSize = '13px';
microUI.style.width = '200px';
microUI.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
microUI.innerHTML = `
  <div style="display: flex; justify-content: space-between; align-items: center;">
    <span style="font-weight: bold;">Mass Sell</span>
    <span id="closeMicroUI" style="cursor:pointer; color: #ccc;">×</span>
  </div>
  <div style="margin-top: 10px;">
    <label for="delayInput" style="display:block; margin-bottom:5px;">Задержка (мс):</label>
    <input type="number" id="delayInput" value="800" min="0" style="width: 100%; box-sizing:border-box; margin-bottom: 10px;">
    <button id="startSellBtn" style="width: 100%; margin-bottom: 5px;">Старт</button>
    <button id="stopSellBtn" style="width: 100%; background-color: #c33;">Стоп</button>
  </div>
`;
document.body.appendChild(microUI);

// Ловим элементы
var closeMicroUI = document.getElementById('closeMicroUI');
var startSellBtn = document.getElementById('startSellBtn');
var stopSellBtn  = document.getElementById('stopSellBtn');
var delayInput   = document.getElementById('delayInput');

// При клике на "×" скрываем панель
closeMicroUI.onclick = function(){
  microUI.style.display = 'none';
};

// == Глобальные переменные и функции, связанные с продажей ==
var wasFiltered = false;
var filtersEnabled = false;

var profit_total_nofee = 0;
var profit_total = 0;
var itemsJustSold = 0;
var errors = false;
var item_idx = 0;
var shouldStop = false;
var email_confirm = false;
var mobile_confirm = false;

// Если вдруг вызывать повторно — снимем патчи, если они были
if(typeof real_OnPriceHistorySuccess !== 'undefined'){
  SellItemDialog.OnPriceHistorySuccess = real_OnPriceHistorySuccess;
  UserYou.ReloadInventory = real_ReloadInventory;
  SellItemDialog.OnSuccess = real_OnSuccess;
  SellItemDialog.OnFailure = real_OnFailure;
  BuildHover = real_BuildHover;
}

// Запоминаем исходные функции Steam
var real_OnPriceHistorySuccess = SellItemDialog.OnPriceHistorySuccess;
var real_ReloadInventory = UserYou.ReloadInventory;
var real_OnSuccess = SellItemDialog.OnSuccess;
var real_OnFailure = SellItemDialog.OnFailure;
var real_BuildHover = BuildHover;

// --- Функции включения/выключения фильтра "marketable" ---
function enableFilters(){
  if(filtersEnabled){return;}
  var checkboxes = document.getElementsByTagName("input");
  for(var i=0;i<checkboxes.length;i++) {
    if(checkboxes[i].name.endsWith("misc_marketable")) {
      wasFiltered = checkboxes[i].checked;
      if(!wasFiltered) {
        checkboxes[i].click();
        break;
      }
    }
  }
  filtersEnabled = true;
}

function disableFilters(){
  if(!filtersEnabled){return;}
  var checkboxes = document.getElementsByTagName("input");
  for(var i=0;i<checkboxes.length;i++) {
    if(checkboxes[i].name.endsWith("misc_marketable")) {
      if(checkboxes[i].checked !== wasFiltered) {
        checkboxes[i].click();
        break;
      }
    }
  }
  filtersEnabled = false;
}

// --- Парсинг дат для русского интерфейса (примерный) ---
function dateStringToTicks(dstring){
  // Ожидаемый формат: "13 дек. 2023 12:00 +3" или что-то похожее
  var parts = dstring.split(" ");
  if(parts.length < 4) {
    return 0; 
  }

  // Месяцы по-русски (пример: "янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек")
  var rusMonths = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

  var day = parseInt(parts[0]);
  var rawMonth = parts[1].replace(".", "").toLowerCase(); // "дек."
  var month = rusMonths.indexOf(rawMonth);
  if(month < 0) { return 0; }

  var year = parseInt(parts[2]);

  var hour = 0, minute = 0;
  if(parts[3].includes(":")) {
    var hm = parts[3].split(":");
    hour = parseInt(hm[0]);
    minute = hm[1] ? parseInt(hm[1]) : 0;
  }

  var offset = 0;
  if(parts.length > 4) {
    var tz = parts[4];
    if(tz[0] === "+") {
      offset = parseInt(tz.substring(1));
    } else if(tz[0] === "-") {
      offset = -parseInt(tz.substring(1));
    }
  }
  var unixTime = Date.UTC(year, month, day, hour, minute);

  // Корректируем на часовой пояс (переводим в "общий" UTC)
  unixTime -= offset * 3600000;

  return unixTime;
}

// --- Патчим нужные функции Steam ---
function patched_BuildHover(prefix,item,owner){
  try {
    real_BuildHover(prefix,item,owner);
  } catch(e) {
    console.error("Ошибка в BuildHover:", e);
    finishSelling();
  }
}

function patched_OnSuccess(transport){
  if(transport.responseJSON) {
    if(transport.responseJSON.requires_confirmation){
      if(transport.responseJSON.needs_mobile_confirmation){
        mobile_confirm = true;
      } else {
        email_confirm = true;
      }
    }
    transport.responseJSON.requires_confirmation = false;
    transport.responseJSON.needs_email_confirmation = false;
    transport.responseJSON.needs_mobile_confirmation = false;
  }

  real_OnSuccess.call(SellItemDialog, transport);
  UserYou.ReloadInventory = real_ReloadInventory;
  SellItemDialog.Dismiss();

  itemsJustSold++;
  setTimeout(sellNextItem, getUserDelay());
}

function patched_OnFailure(transport){
  errors = true;
  var itemName = "???";
  try {
    var elItem = document.getElementsByClassName("itemHolder")[item_idx].children[0];
    itemName = elItem.rgItem.name + " (" + elItem.rgItem.type + ")";
  } catch(e) {}

  if(transport.responseJSON && transport.responseJSON.message) {
    console.error("Ошибка при продаже " + itemName + ":\n" + transport.responseJSON.message);
  } else {
    console.error("Неизвестная ошибка при продаже " + itemName + ".");
  }

  profit_total -= SellItemDialog.GetPriceAsInt();
  profit_total_nofee -= SellItemDialog.GetBuyerPriceAsInt();

  real_OnFailure.call(SellItemDialog, transport);
  SellItemDialog.Dismiss();

  setTimeout(sellNextItem, getUserDelay());
}

function patched_OnPriceHistorySuccess(transport){
  // Смотрим продажи за последние сутки
  var now = Date.now();
  var oneDayMs = 24*60*60*1000;

  var sumPrices = 0;
  var countPrices = 0;

  for(var i=0; i<transport.responseJSON.prices.length; i++){
    var dataPoint = transport.responseJSON.prices[i];
    var dataTime = dateStringToTicks(dataPoint[0]);
    if(!dataTime) { continue; }

    if(now - dataTime <= oneDayMs) {
      var price = dataPoint[1];
      var quantity = parseInt(dataPoint[2]);
      sumPrices += price * quantity;
      countPrices += quantity;
    }
  }

  var finalPrice = 0.01; // fallback 1 цент
  if(countPrices > 0) {
    finalPrice = sumPrices / countPrices;
  }

  var totalPrice = Math.round(finalPrice * 100);

  profit_total_nofee += totalPrice;

  real_OnPriceHistorySuccess(transport);

  document.getElementById("market_sell_dialog_accept_ssa").checked = true;

  var priceString = v_currencyformat(totalPrice, GetCurrencyCode(g_rgWalletInfo['wallet_currency']));
  document.getElementById("market_sell_buyercurrency_input").value = priceString;

  SellItemDialog.OnBuyerPriceInputKeyUp(null);

  profit_total += SellItemDialog.GetPriceAsInt();

  var mockEvent = {stop:function(){}};
  SellItemDialog.OnAccept(mockEvent);
  SellItemDialog.OnConfirmationAccept(mockEvent);
}

// --- Основные функции процесса ---
function getUserDelay(){
  // Читаем из текстового поля
  var val = parseInt(delayInput.value);
  if(isNaN(val) || val < 0) {
    val = 800;
  }
  return val;
}

function sellNextItem(){
  if(shouldStop){
    finishSelling();
    return;
  }

  var items = document.getElementsByClassName("itemHolder");

  while(item_idx < items.length && items[item_idx].style.display === "none"){
    item_idx++;
  }

  if(item_idx >= items.length){
    finishSelling();
    return;
  }

  var elItem = items[item_idx].children[0];

  // Если хотите продавать только карточки, раскомментируйте:
  // if(!elItem.rgItem.type.includes("Trading Card")){
  //   item_idx++;
  //   setTimeout(sellNextItem, getUserDelay());
  //   return;
  // }

  g_ActiveInventory.SelectItem(null, elItem, elItem.rgItem, false);
  SellCurrentSelection();

  item_idx++;
}

function finishSelling(){
  disableFilters();

  // Откатываем патчи
  SellItemDialog.OnPriceHistorySuccess = real_OnPriceHistorySuccess;
  UserYou.ReloadInventory = real_ReloadInventory;
  SellItemDialog.OnSuccess = real_OnSuccess;
  SellItemDialog.OnFailure = real_OnFailure;
  BuildHover = real_BuildHover;

  showItemSellStats();
}

function showItemSellStats(){
  var confirmation_text = "";
  if(mobile_confirm){
    confirmation_text = "\n\nТребуется мобильное подтверждение.";
  } else if(email_confirm){
    confirmation_text = "\n\nТребуется подтверждение по e-mail.";
  }
  if(errors){
    confirmation_text += "\n\nВо время продажи возникали ошибки. См. консоль (F12).";
  }

  alert("Продажа завершена." +
    "\nУспешно выставлено: " + itemsJustSold +
    "\nСумма без комиссии: " + v_currencyformat(profit_total_nofee, GetCurrencyCode(g_rgWalletInfo['wallet_currency'])) +
    "\nПосле комиссии: " + v_currencyformat(profit_total, GetCurrencyCode(g_rgWalletInfo['wallet_currency'])) +
    confirmation_text
  );
}

// --- Подготовка к запуску цикла ---
function runSellCycle(){
  // Сбрасываем переменные, если запускать повторно
  itemsJustSold = 0;
  errors = false;
  item_idx = 0;
  shouldStop = false;
  profit_total_nofee = 0;
  profit_total = 0;
  email_confirm = false;
  mobile_confirm = false;

  enableFilters();

  SellItemDialog.OnPriceHistorySuccess = patched_OnPriceHistorySuccess;
  UserYou.ReloadInventory = function(appid,contextid){};
  SellItemDialog.OnSuccess = patched_OnSuccess;
  SellItemDialog.OnFailure = patched_OnFailure;
  BuildHover = patched_BuildHover;

  sellNextItem();
}

// --- Кнопка «Старт»: запускаем автоматическую продажу
startSellBtn.onclick = function(){
  // Проверим, что мы на нужной странице
  if(!(window.location.href.startsWith("https://steamcommunity.com/id/") && window.location.href.endsWith("/inventory/"))) {
    alert("Скрипт работает только на странице инвентаря Steam.\nОткройте свой инвентарь.\nНапример: https://steamcommunity.com/id/ВАШ_ID/inventory/");
    return;
  }

  if(g_rgWalletInfo['wallet_currency'] === 0) {
    alert("У вас нет денег в кошельке. Продажа предметов может потребовать наличия средств на аккаунте.");
    return;
  }

  runSellCycle();
};

// --- Кнопка «Стоп»: останавливаем цикл
stopSellBtn.onclick = function(){
  shouldStop = true;
  console.log("Остановка массовой продажи запрошена пользователем.");
};

// == Конец скрипта UI == //
