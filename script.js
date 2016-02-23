(function(){
    "use strict";
    
    var newSocket, //объект вебсокета
        socketName = "ws://128.199.49.24:1234", //адрес вебокета
        token = {"action": "assets", "message": {}}, //токен
        subscriptionMsg = {"action":"subscribe","message":{}}, //сообщение для подписки на актив
        msg, //отправляемое сообщение
        id, //айди актива
        chartElem = document.getElementById("chart-wrapper"), //родительский элемент компонента
        newChart; // объект компонента
    
    
    //после онлоада создаю вебсокет
    window.addEventListener("load", function(){

        //устанавливаю соединение с вебсокетом
        newSocket = new WebSocket(socketName);

        //после установки соединения с вебсокетом отправляю токен
        newSocket.onopen = function(){
            sendMsg(token, newSocket);
        }

        //проверяю полученные данные и на их основе выполняю нужные действия

        newSocket.onmessage = function(event) {
            var data = JSON.parse(event.data);
                        
            //если получен список активов, то создаю объект компонента и автоматически подписываюсь на первый из активов
            if(data["action"] == "assets"){
                
                newChart = new Chart(chartElem, data);
                newChart.changeActive(0); 
            }
            
            //если получен список пойнтов для инициализации, то добавляю их в массив
             
            if(data["action"] == "asset_history"){
                newChart.addPoints(data);
            }
            
            //если получен пойнт, то добавляю его в массив и строю график
            if(data["action"] == "point"){
                newChart.addPoints(data);
                newChart.draw(); 
            }
        };
    }, false);
    

    
    
    
    // конструктор графика, принимает родительский элемент и массив с активами
    function Chart(elem, msg){
        
        //переменная со ссылкой на возвращаемый объект
        var self = this;
        
        //массив с точками графика
        this._pointsArray = [];
        
        //максимальное время отображения точек на графике
        this._chartTime = 5 * 60 * 1000;
        
        //создаю селект и канвас
        this.canvas = this.renderCanvas(elem);
        this.select = this.renderSelect(elem, msg);
        
        //обработчик селекта для смены актива
        this.select.addEventListener("change", function(){self.changeActive();}, false);
    }
        
    //метод создания селекта с активами
    Chart.prototype.renderSelect = function(elem, msg){
        var newSelect = document.createElement("SELECT");
        
        msg["message"]["assets"].forEach(function(item){
            newSelect.appendChild(document.createElement("OPTION"));
            newSelect.lastElementChild.textContent = item["name"];
            newSelect.lastElementChild.value = item["id"];
        });
            
        elem.appendChild(newSelect);
            
        return newSelect;
    }
    
    //метод создания канваса
    Chart.prototype.renderCanvas = function(elem){
        var newCanvas = document.createElement("CANVAS");
        
        //канвас занимает все  пространство родительского элемента, либо принимает размеры по умолчанию
        newCanvas.width = elem.offsetWidth || 600;
        newCanvas.height = elem.offsetHeight || 400;
            
        elem.appendChild(newCanvas);
            
        return newCanvas;
    }
    
    //метод обработчика селекта для смены актива, принимает номер опции
    Chart.prototype.changeActive = function(option){
        var chartActiveId,
            chartMsg = subscriptionMsg; 
        
        //если аргумент является числом, валидным относительно количества опций селекта, то программно изменяю выбранную опцию селекта
        if(isNumeric(option) && option >= 0 && option < this.select.options.length){ 
            this.select.selectedIndex = option;
            chartActiveId = +this.select.value;            
        } else {
            chartActiveId = +this.select.value;
        }
        
        chartMsg["message"]["assetId"] = chartActiveId;
        sendMsg(chartMsg, newSocket);   
    }
    
    //Метод добавления точек графика в массив точек
    Chart.prototype.addPoints = function(option){
        
        //не произвожу над аргументом действий, если он не является объектом
        if(typeof option === "object"){
            
            if(option["action"] == "asset_history"){
                //это означает, что мне пришел массив точек для инциализации графика
                this._pointsArray = option["message"]["points"];
            } 
            if(option["action"] == "point"){
                //это означает, что аргумент является объектом, представляющим одну новую точку графика, добавляю его в массив точек
                this._pointsArray.push(option["message"]);
                
                //пока разница во времени между последней и первой точкой больше, чем макс время графика, то первая точка удаляется из массива
                while(this._pointsArray[this._pointsArray.length - 1]["time"] - this._pointsArray[0]["time"] > this._chartTime){
                    this._pointsArray.shift();
                }
            }
        }
    }
    
    //метод отрисовки графика
    Chart.prototype.draw = function(){
        var ctx = this.canvas.getContext('2d'),
            //размеры поля графика
            chartWidth = this.canvas.width * 4 / 5,
            chartHeight = this.canvas.height - 20,
            //максимальное и минимальное значения графика
            maxValue = this._pointsArray[0]["value"], 
            minValue = this._pointsArray[0]["value"],
            //разница между максимальным и минимальным значениями
            delta,
            //отношение общей ширины канваса в пикселях к полному времени в секундах
            pixelTimeRatio = chartWidth / this._chartTime,
            //время первой точки
            startTime = this._pointsArray[0]["time"],
            chartFillColor = "rgba(255,190,0,0.5)",
            chartStrokeColor = "rgba(255,190,0,1)",
            coordX,
            coordY,
            date,
            currentMinute;
        
        //нахожу максимальное и минимальное значения массива точек
        for ( var i = 0; i < this._pointsArray.length; i++){
            if(this._pointsArray[i]["value"] > maxValue){
                maxValue = this._pointsArray[i]["value"];
                continue;
            }
            
            if(this._pointsArray[i]["value"] < minValue){
                minValue = this._pointsArray[i]["value"];
            }
        }
        delta = maxValue - minValue;
        
        //уменьшаю масштаб графика по вертикали путем увеличения максимального значения и уменьшения минимального
        maxValue = maxValue + delta / 6;
        minValue = minValue - delta / 6;
        delta = maxValue - minValue;
        
        //очищаю канвас перед выводом следующего кадра
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        //строю сетку и подписи
        ctx.font = "10px Arial";
        ctx.strokeStyle = "#ddd";
        
        //курс
        for (var i = 1; i < 8; i++){
            ctx.fillText((minValue + delta * i / 8 ).toFixed(5), chartWidth + 10, chartHeight - (chartHeight * i / 8));
            
            ctx.beginPath();  
            ctx.moveTo(1.5, chartHeight - (chartHeight * i / 8));
            ctx.lineTo(chartWidth, chartHeight - (chartHeight * i / 8));
            ctx.stroke();
        }
        
        //время
        date = new Date(this._pointsArray[0]["time"]);
        currentMinute = date.getMinutes();  
        for (var i = 0; i < this._pointsArray.length; i++){ 
            date = new Date(this._pointsArray[i]["time"]);
            if (currentMinute != date.getMinutes()){
                ctx.fillText(date.toLocaleString("en", {hour: 'numeric',  minute: 'numeric',}), (this._pointsArray[i]["time"] - startTime) * pixelTimeRatio, chartHeight + 15); 
                currentMinute = date.getMinutes();  
            }
        }
        
        ctx.save();
        //привожу канвас к декартовой системе координат
        ctx.translate(0, this.canvas.height);
        ctx.scale(1, -1);
        
        //рисую график
        ctx.strokeStyle = chartStrokeColor;
        ctx.fillStyle = chartFillColor;
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        
        //внутренняя часть
        ctx.beginPath();
        ctx.moveTo(0.5, (chartHeight * (this._pointsArray[0]["value"] - minValue)) / delta + 20);
        for (var i = 1; i < this._pointsArray.length; i++){
            //чтобы получить х-координату точки, вычитаю из времени точки время первой точки, разницу умножаю на отношение канваса к общему  времени    
            coordX = (this._pointsArray[i]["time"] - startTime) * pixelTimeRatio;
            //чтобы получить у-координату точки, составляю пропорцию: (у-координата / (значение точки - мин значение графика) = высота графика / (макс значение графика - мин значение графика)), к получившемуся выражению прибавляю 20, т.к. график отступает на 20 пикс от нижней границы канваса
            coordY = (chartHeight * (this._pointsArray[i]["value"] - minValue)) / delta + 20;
            ctx.lineTo(coordX, coordY);
        }
        ctx.stroke();
        ctx.lineTo(coordX, 20);
        ctx.lineTo(0.5, 20);
        ctx.fill();
        
        //рисую поле содержащее график
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#000";
        ctx.strokeRect(0.5, 20, chartWidth, chartHeight);  
        ctx.restore(); 
    }
    
    
    
    //функция отправки сообщения в вебсокет
    function sendMsg(msg, socket){
        socket.send(JSON.stringify(msg));
    }
    
    //функция проверки на число
    function isNumeric(n) {
        return !isNaN(parseFloat(n)) && isFinite(n);
    }
    
})();