/***************************************************
 *  ГЛАВНЫЙ СКРИПТ ДЛЯ АВТОМАТИЧЕСКОЙ ПРОДАЖИ
 *           steam-bulk-sell.js
 ***************************************************/

// Убедимся, что юзер на нужной странице:
if (
    !(
      window.location.href.startsWith("https://steamcommunity.com/id/") &&
      window.location.href.endsWith("/inventory/")
    )
  ) {
    alert(
      "Скрипт не будет работать, если вы не находитесь на странице инвентаря Steam.\n" +
        "Убедитесь, что URL имеет вид:\n" +
        "https://steamcommunity.com/id/ВАШ_ID/inventory/"
    );
  }
  
  if (g_rgWalletInfo["wallet_currency"] === 0) {
    alert(
      "Нельзя автоматически выставлять карточки на продажу,\n" +
        "если кошелёк Steam ни разу не пополнялся."
    );
  }
  
  /***************************************************
   *             ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
   ***************************************************/
  var wasFiltered = false;
  var filtersEnabled = false;
  
  var profit_total_nofee = 0;
  var profit_total = 0;
  var cardsJustSold = 0;
  var errors = false;
  var card_idx = 0;
  var email_confirm = false;
  var mobile_confirm = false;
  var autoSellActive = false;
  
  // Основные настройки (перезаполняются из GUI)
  var sellDelay = 800;          // задержка между продажами (мс)
  var randomDelayRange = 0;     // добавочная случайная задержка от 0 до randomDelayRange (мс)
  var maxCardsToSell = 0;       // 0 — означает «без ограничений»
  var minPriceToSell = 0;       // минимальная цена (в копейках/центах). 0 — нет минимума
  var maxPriceToSell = 0;       // максимальная цена (в копейках/центах). 0 — нет максимума
  var markupPercent = 0;        // надбавка к вычисленной цене (в %)
  var skipFoil = false;         // пропускать ли фольгированные карточки
  var analysisDays = 10;        // количество дней для анализа (по умолчанию 10)
  
  /***************************************************
   *     СОХРАНЯЕМ ССЫЛКИ НА ОРИГИНАЛЬНЫЕ ФУНКЦИИ
   ***************************************************/
  var real_OnPriceHistorySuccess = SellItemDialog.OnPriceHistorySuccess;
  var real_ReloadInventory = UserYou.ReloadInventory;
  var real_OnSuccess = SellItemDialog.OnSuccess;
  var real_OnFailure = SellItemDialog.OnFailure;
  var real_BuildHover = BuildHover;
  
  /***************************************************
   *   ГРАФИЧЕСКИЙ ИНТЕРФЕЙС: СОЗДАНИЕ/ОТОБРАЖЕНИЕ
   ***************************************************/
  (function createGUI() {
    // Контейнер
    var guiContainer = document.createElement("div");
    guiContainer.id = "simpleSellGui";
    guiContainer.style.position = "fixed";
    guiContainer.style.left = "20px";
    guiContainer.style.bottom = "20px";
    guiContainer.style.padding = "10px";
    guiContainer.style.backgroundColor = "rgba(0,0,0,0.8)";
    guiContainer.style.border = "1px solid #666";
    guiContainer.style.zIndex = "9999";
    guiContainer.style.color = "#fff";
    guiContainer.style.fontFamily = "Arial, sans-serif";
    guiContainer.style.width = "270px";
  
    guiContainer.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;font-size:14px;">Авто-продажа</h3>
        <button id="toggleSettingsBtn" style="font-size:12px;">▲</button>
      </div>
      <div id="expandableMenu" style="margin-top:5px;">
        <label style="font-size:12px;" for="delayInput">Задержка (мс):</label>
        <input type="number" id="delayInput" value="800" style="width:70px;"><br>
  
        <label style="font-size:12px;" for="rndDelayInput">Случайная + (мс):</label>
        <input type="number" id="rndDelayInput" value="0" style="width:70px;"><br>
  
        <label style="font-size:12px;" for="maxCardsInput">Макс. кол-во карт:</label>
        <input type="number" id="maxCardsInput" value="0" style="width:70px;"><br>
  
        <label style="font-size:12px;" for="minPriceInput">Мин. цена (копейки):</label>
        <input type="number" id="minPriceInput" value="0" style="width:70px;"><br>
  
        <label style="font-size:12px;" for="maxPriceInput">Макс. цена (копейки):</label>
        <input type="number" id="maxPriceInput" value="0" style="width:70px;"><br>
  
        <label style="font-size:12px;" for="markupInput">Надбавка (%) к цене:</label>
        <input type="number" id="markupInput" value="0" style="width:70px;"><br>
        
        <!-- Новое поле для ввода количества дней для анализа -->
        <label style="font-size:12px;" for="analysisDaysInput">Дней для анализа:</label>
        <input type="number" id="analysisDaysInput" value="10" style="width:70px;"><br>
  
        <label style="font-size:12px;">
          <input type="checkbox" id="skipFoilCheck"> Пропускать фольгу
        </label><br>
  
        <div style="margin-top:8px;">
          <button id="startSellingBtn" style="margin-right:10px;">Начать</button>
          <button id="stopSellingBtn">Остановить</button>
        </div>
        <p style="margin-top:8px;font-size:0.85em;">
          Откройте консоль (F12), чтобы видеть детали.
        </p>
      </div>
    `;
    document.body.appendChild(guiContainer);
  
    // Сворачивание / разворачивание
    var toggleButton = document.getElementById("toggleSettingsBtn");
    var menuBlock = document.getElementById("expandableMenu");
    toggleButton.onclick = function () {
      if (menuBlock.style.display === "none") {
        menuBlock.style.display = "block";
        toggleButton.textContent = "▲";
      } else {
        menuBlock.style.display = "none";
        toggleButton.textContent = "▼";
      }
    };
  
    // Кнопки «Начать» / «Остановить»
    document
      .getElementById("startSellingBtn")
      .addEventListener("click", startSelling);
    document
      .getElementById("stopSellingBtn")
      .addEventListener("click", stopSelling);
  })();
  
  /***************************************************
   *                 ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ***************************************************/
  function dateStringToTicks(dstring) {
    // Преобразует строку вида "Jan 1 2025 1:00 +3" в миллисекунды (Unix epoch)
    var parts = dstring.split(" ");
    var month = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ].indexOf(parts[0]);
    var year = parseInt(parts[2]);
    var day = parseInt(parts[1]);
    var hour = parseInt(parts[3].split(":")[0]);
    var unixTime = Date.UTC(year, month, day, hour);
  
    if (parts[3].split(":")[1] !== "") {
      unixTime += 1000 * 60 * parseInt(parts[3].split(":")[1]);
    }
    // Корректируем под указанный в дате часовой пояс
    if (parts.length > 4) {
      if (parts[4][0] === "+") {
        unixTime += 1000 * 60 * 60 * parseInt(parts[4].substring(1));
      } else if (parts[4][0] === "-") {
        unixTime -= 1000 * 60 * 60 * parseInt(parts[4].substring(1));
      }
    }
    return unixTime;
  }
  
  // Получаем реальную задержку с учётом randomDelayRange
  function getNextDelay() {
    if (randomDelayRange > 0) {
      return sellDelay + Math.floor(Math.random() * randomDelayRange);
    }
    return sellDelay;
  }
  
  function enableFilters() {
    if (filtersEnabled) return;
    var checkboxes = document.getElementsByTagName("input");
    for (var i = 0; i < checkboxes.length; i++) {
      if (checkboxes[i].name.endsWith("misc_marketable")) {
        wasFiltered = checkboxes[i].checked;
        if (wasFiltered === false) {
          checkboxes[i].click();
          break;
        }
      }
    }
    filtersEnabled = true;
  }
  
  function disableFilters() {
    if (!filtersEnabled) return;
    var checkboxes = document.getElementsByTagName("input");
    for (var i = 0; i < checkboxes.length; i++) {
      if (checkboxes[i].name.endsWith("misc_marketable")) {
        if (checkboxes[i].checked !== wasFiltered) {
          checkboxes[i].click();
          break;
        }
      }
    }
    filtersEnabled = false;
  }
  
  /***************************************************
   *                 ПАТЧИ ФУНКЦИЙ
   ***************************************************/
  function patched_BuildHover(prefix, item, owner) {
    try {
      real_BuildHover(prefix, item, owner);
    } catch (TypeError) {
      // Если случилась ошибка — завершаем процесс
      finishSelling();
    }
  }
  
  function patched_OnSuccess(transport) {
    if (transport.responseJSON) {
      if (transport.responseJSON.requires_confirmation) {
        if (transport.responseJSON.needs_mobile_confirmation) {
          mobile_confirm = true;
        } else {
          email_confirm = true;
        }
        transport.responseJSON.requires_confirmation = false;
        transport.responseJSON.needs_email_confirmation = false;
        transport.responseJSON.needs_mobile_confirmation = false;
      }
    }
    // Вызываем оригинальную функцию
    real_OnSuccess.call(SellItemDialog, transport);
    // Возвращаем оригинальный ReloadInventory
    UserYou.ReloadInventory = real_ReloadInventory;
    // Закрываем диалог
    SellItemDialog.Dismiss();
  
    cardsJustSold++;
    setTimeout(sellNextCard, getNextDelay());
  }
  
  function patched_OnFailure(transport) {
    errors = true;
    var cardName = "???";
    try {
      var elItem = document.getElementsByClassName("itemHolder")[card_idx].children[0];
      cardName =
        elItem.rgItem.name +
        " (" +
        elItem.rgItem.type.replace(" Trading Card", "") +
        ")";
    } catch (e) {}
  
    if (transport.responseJSON && transport.responseJSON.message) {
      console.error(
        "Ошибка при продаже " + cardName + ":\n" + transport.responseJSON.message
      );
    } else {
      console.error("Неопознанная ошибка при продаже " + cardName + ".");
    }
  
    profit_total -= SellItemDialog.GetPriceAsInt();
    profit_total_nofee -= SellItemDialog.GetBuyerPriceAsInt();
  
    real_OnFailure.call(SellItemDialog, transport);
    SellItemDialog.Dismiss();
    setTimeout(sellNextCard, getNextDelay());
  }
  
  function patched_OnPriceHistorySuccess(transport) {
    // Автоматически вычисляем медианную цену за последние analysisDays дней
    var cardsPerPrice = [];
    var totalCardsSold = 0;
    for (var i = 0; i < transport.responseJSON.prices.length; i++) {
      var dataPoint = transport.responseJSON.prices[i];
      // Игнорируем, если данные старше analysisDays дней
      if (Date.now() - dateStringToTicks(dataPoint[0]) > 1000 * 60 * 60 * 24 * analysisDays) {
        continue;
      }
      var medianPrice = dataPoint[1];
      var cardsSold = parseInt(dataPoint[2]);
  
      var found = false;
      for (var j = 0; j < cardsPerPrice.length; j++) {
        if (cardsPerPrice[j][0] === medianPrice) {
          cardsPerPrice[j][1] += cardsSold;
          found = true;
          break;
        }
      }
      if (!found) {
        cardsPerPrice.push([medianPrice, cardsSold]);
      }
      totalCardsSold += cardsSold;
    }
  
    // Находим медианную цену
    cardsPerPrice.sort(function (a, b) {
      return a[0] - b[0];
    });
    var cardsToCount = totalCardsSold / 2;
    var priceIdx = -1;
    while (cardsToCount > 0 && priceIdx < cardsPerPrice.length - 1) {
      priceIdx++;
      cardsToCount -= cardsPerPrice[priceIdx][1];
    }
    var totalMedianPrice = 0;
    if (priceIdx >= 0) {
      totalMedianPrice = Math.round(cardsPerPrice[priceIdx][0] * 100);
    }
  
    // Запоминаем «оригинальную» цену (без надбавки)
    var originalMedianPrice = totalMedianPrice;
  
    // Добавляем в статистику (до комиссий)
    profit_total_nofee += originalMedianPrice;
  
    // Запускаем оригинальную функцию (она нужна, чтобы прописать разные данные в диалог)
    real_OnPriceHistorySuccess(transport);
  
    // Соглашаемся с лиц. соглашением и вписываем полученную цену
    document.getElementById("market_sell_dialog_accept_ssa").checked = true;
  
    // === Добавляем процент надбавки (если указан) ===
    if (markupPercent > 0) {
      totalMedianPrice = Math.round(totalMedianPrice * (1 + markupPercent / 100));
    }
  
    // Логируем цены в консоль:
    console.log(
      "Оригинальная медианная цена (без надбавки): " + originalMedianPrice + 
      " | Цена с надбавкой: " + totalMedianPrice
    );
  
    // Подставляем итоговую цену (та, которую будет платить покупатель)
    var totalPriceString = v_currencyformat(
      totalMedianPrice,
      GetCurrencyCode(g_rgWalletInfo["wallet_currency"])
    );
    document.getElementById("market_sell_buyercurrency_input").value =
      totalPriceString;
  
    // Пересчитываем комиссию
    SellItemDialog.OnBuyerPriceInputKeyUp(null);
  
    // Теперь получим фактическую «цену покупателя» и «цену продавца»
    var buyerPays = SellItemDialog.GetBuyerPriceAsInt();
    var sellerReceives = SellItemDialog.GetPriceAsInt();
  
    console.log(
      "Покупатель платит (GetBuyerPriceAsInt): " + buyerPays +
      " | Продавец получит (GetPriceAsInt): " + sellerReceives
    );
  
    // Добавляем сумму (после комиссий)
    profit_total += sellerReceives;
  
    // Проверяем лимиты (мин/макс цены)
    if (
      (minPriceToSell > 0 && totalMedianPrice < minPriceToSell) ||
      (maxPriceToSell > 0 && totalMedianPrice > maxPriceToSell)
    ) {
      console.log("Цена " + totalMedianPrice + " коп. не проходит по лимитам. Пропуск.");
      SellItemDialog.Dismiss();
      setTimeout(sellNextCard, getNextDelay());
      return;
    }
  
    // Всё ок — выставляем карточку
    var mockEvent = { stop: function () {} };
    SellItemDialog.OnAccept(mockEvent);
    SellItemDialog.OnConfirmationAccept(mockEvent);
  }
  
  /***************************************************
   *          ОСНОВНЫЕ ФУНКЦИИ ПРОДАЖИ
   ***************************************************/
  function sellNextCard() {
    // Проверяем, не нажал ли пользователь «Остановить»
    if (!autoSellActive) {
      finishSelling();
      return;
    }
  
    // Проверяем, не достигнут ли лимит по количеству
    if (maxCardsToSell > 0 && cardsJustSold >= maxCardsToSell) {
      console.log("Достигнут лимит по количеству карт: " + maxCardsToSell);
      finishSelling();
      return;
    }
  
    var cards = document.getElementsByClassName("itemHolder");
  
    // Пропускаем скрытые
    while (card_idx < cards.length && cards[card_idx].style.display === "none") {
      card_idx++;
    }
  
    // Если все карточки перебрали — завершаем
    if (card_idx >= cards.length) {
      finishSelling();
      return;
    }
  
    var elItem = cards[card_idx].children[0];
  
    // === Проверяем, не нужно ли пропустить фольгу ===
    // (Foil Trading Card / Фольгированная карточка)
    if (skipFoil) {
      var itemType = elItem.rgItem.type.toLowerCase();
      // Можно «foil» или «фольгированная» — зависит от локализации
      if (itemType.indexOf("foil") !== -1 || itemType.indexOf("фольг") !== -1) {
        console.log("Пропускаем фольгированную карточку: " + elItem.rgItem.name);
        card_idx++;
        setTimeout(sellNextCard, getNextDelay());
        return;
      }
    }
  
    // Переходим к продаже
    g_ActiveInventory.SelectItem(null, elItem, elItem.rgItem, false);
    SellCurrentSelection();
  
    console.log(
      "Продаём карточку №" +
        (card_idx + 1) +
        ": " +
        elItem.rgItem.name +
        " (" +
        elItem.rgItem.type +
        ")."
    );
  
    card_idx++;
  }
  
  function showCardSellStats() {
    var confirmation_text = "";
    if (mobile_confirm) {
      confirmation_text =
        "\n\nТребуется подтверждение через мобильное приложение Steam Guard.\n" +
        "Если в приложении нет кнопки «Подтвердить», попробуйте обновить приложение.";
    } else if (email_confirm) {
      confirmation_text =
        "\n\nТребуется подтверждение через e-mail. Проверьте почту.";
    }
    if (errors) {
      confirmation_text +=
        "\n\nВо время продажи некоторых карточек возникли ошибки. Подробности в консоли (F12).";
    }
    alert(
      "Процесс продажи завершён.\n" +
        "Успешно выставлено карточек: " +
        cardsJustSold +
        "\n" +
        "Общая сумма (без учёта комиссии): " +
        v_currencyformat(
          profit_total_nofee,
          GetCurrencyCode(g_rgWalletInfo["wallet_currency"])
        ) +
        "\n" +
        "Сумма (примерно) после комиссии Steam: " +
        v_currencyformat(
          profit_total,
          GetCurrencyCode(g_rgWalletInfo["wallet_currency"])
        ) +
        confirmation_text
    );
  }
  
  function runSellCycle() {
    enableFilters();
    // Перехватываем нужные функции
    SellItemDialog.OnPriceHistorySuccess = patched_OnPriceHistorySuccess;
    UserYou.ReloadInventory = function (appid, contextid) {};
    SellItemDialog.OnSuccess = patched_OnSuccess;
    SellItemDialog.OnFailure = patched_OnFailure;
    BuildHover = patched_BuildHover;
  
    // Начинаем
    sellNextCard();
  }
  
  function finishSelling() {
    disableFilters();
    // Возвращаем всё как было
    SellItemDialog.OnPriceHistorySuccess = real_OnPriceHistorySuccess;
    UserYou.ReloadInventory = real_ReloadInventory;
    SellItemDialog.OnSuccess = real_OnSuccess;
    SellItemDialog.OnFailure = real_OnFailure;
    BuildHover = real_BuildHover;
  
    showCardSellStats();
  }
  
  /***************************************************
   *       СТАРТ/СТОП АВТОМАТИЧЕСКОЙ ПРОДАЖИ
   ***************************************************/
  function startSelling() {
    // Считываем новые параметры из меню
    sellDelay = parseInt(document.getElementById("delayInput").value) || 800;
    randomDelayRange = parseInt(document.getElementById("rndDelayInput").value) || 0;
    maxCardsToSell = parseInt(document.getElementById("maxCardsInput").value) || 0;
    minPriceToSell = parseInt(document.getElementById("minPriceInput").value) || 0;
    maxPriceToSell = parseInt(document.getElementById("maxPriceInput").value) || 0;
    markupPercent = parseInt(document.getElementById("markupInput").value) || 0;
    skipFoil = document.getElementById("skipFoilCheck").checked;
    analysisDays = parseInt(document.getElementById("analysisDaysInput").value) || 10; // Получаем количество дней для анализа
  
    // Сбрасываем счётчики
    profit_total_nofee = 0;
    profit_total = 0;
    cardsJustSold = 0;
    errors = false;
    card_idx = 0;
    email_confirm = false;
    mobile_confirm = false;
  
    autoSellActive = true;
    runSellCycle();
  }
  
  function stopSelling() {
    autoSellActive = false;
    // На следующем шаге продажа завершается (finishSelling())
  }
