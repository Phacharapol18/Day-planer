let currentTime = document.querySelectorAll('.hour');
let colorChange = document.querySelectorAll('input');
let change0 = document.querySelector('.change0');
let change1 = document.querySelector('.change1');
let change2 = document.querySelector('.change2');
let change3 = document.querySelector('.change3');
let change4 = document.querySelector('.change4');
let change5 = document.querySelector('.change5');
let change6 = document.querySelector('.change6');
let change7 = document.querySelector('.change7');
let change8 = document.querySelector('.change8');
let change9 = document.querySelector('.change9');
let change10 = document.querySelector('.change10');
let change11 = document.querySelector('.change11');
let change12 = document.querySelector('.change12');
let change13 = document.querySelector('.change13');
let change14 = document.querySelector('.change14');
let saveBtn = document.querySelectorAll('.saveBtn');
let des = document.querySelectorAll('.description');


let currentDay = setInterval(function () {
    let time = moment().format('MMM Do, YYYY [AT] HH:mm:ss');
    document.querySelector('#currentDay').textContent = time;
}, 1000)


let array = moment().toArray();
console.log(array);

function timerSet() {
    colorChange.forEach(element => {
        if (array[3] < 09) {
            change0.style.backgroundColor = '#77dd77'
        } else if (array[3] === 09) {
            change0.style.backgroundColor = '#ff6961'
        } else {
            element.style.backgroundColor = '#d3d3d3'
        }
        if (array[3] < 10) {
            change1.style.backgroundColor = '#77dd77'
        } else if (array[3] === 10) {
            change1.style.backgroundColor = '#ff6961'
        } else {
            element.style.backgroundColor = '#d3d3d3'
        }
        if (array[3] < 11) {
            change2.style.backgroundColor = '#77dd77'
        } else if (array[3] === 11) {
            change2.style.backgroundColor = '#ff6961'
        } else {
            element.style.backgroundColor = '#d3d3d3'
        }
        if (array[3] < 12) {
            change3.style.backgroundColor = '#77dd77'
        } else if (array[3] === 12) {
            change3.style.backgroundColor = '#ff6961'
        } else {
            element.style.backgroundColor = '#d3d3d3'
        }
        if (array[3] < 13) {
            change4.style.backgroundColor = '#77dd77'
        } else if (array[3] === 13) {
            change4.style.backgroundColor = '#ff6961'
        } else {
            element.style.backgroundColor = '#d3d3d3'
        }
        if (array[3] < 14) {
            change5.style.backgroundColor = '#77dd77'
        } else if (array[3] === 14) {
            change5.style.backgroundColor = '#ff6961'
        } else {
            element.style.backgroundColor = '#d3d3d3'
        }
        if (array[3] < 15) {
            change6.style.backgroundColor = '#77dd77'
        } else if (array[3] === 15) {
            change6.style.backgroundColor = '#ff6961'
        } else {
            element.style.backgroundColor = '#d3d3d3'
        }
        if (array[3] < 16) {
            change7.style.backgroundColor = '#77dd77'
        } else if (array[3] === 16) {
            change7.style.backgroundColor = '#ff6961'
        } else {
            element.style.backgroundColor = '#d3d3d3'
        }
        if (array[3] < 17) {
            change8.style.backgroundColor = '#77dd77'
        } else if (array[3] === 17) {
            change8.style.backgroundColor = '#ff6961'
        } else {
            element.style.backgroundColor = '#d3d3d3'
        }
        if (array[3] < 18) {
            change9.style.backgroundColor = '#77dd77'
        } else if (array[3] === 18) {
            change9.style.backgroundColor = '#ff6961'
        } else {
            element.style.backgroundColor = '#d3d3d3'
        }
        if (array[3] < 19) {
            change10.style.backgroundColor = '#77dd77'
        } else if (array[3] === 19) {
            change10.style.backgroundColor = '#ff6961'
        } else {
            element.style.backgroundColor = '#d3d3d3'
        }
        if (array[3] < 20) {
            change11.style.backgroundColor = '#77dd77'
        } else if (array[3] === 20) {
            change11.style.backgroundColor = '#ff6961'
        } else {
            element.style.backgroundColor = '#d3d3d3'
        }
        if (array[3] < 21) {
            change12.style.backgroundColor = '#77dd77'
        } else if (array[3] === 21) {
            change12.style.backgroundColor = '#ff6961'
        } else {
            element.style.backgroundColor = '#d3d3d3'
        }
        if (array[3] < 22) {
            change13.style.backgroundColor = '#77dd77'
        } else if (array[3] === 22) {
            change13.style.backgroundColor = '#ff6961'
        } else {
            element.style.backgroundColor = '#d3d3d3'
        }
        if (array[3] < 23) {
            change14.style.backgroundColor = '#77dd77'
        } else if (array[3] === 23) {
            change14.style.backgroundColor = '#ff6961'
        } else {
            element.style.backgroundColor = '#d3d3d3'
        }

    });

}

timerSet()

//  const input = {
//     myContent: myContent
//  }
let saveArr = JSON.parse(localStorage.getItem('saveArr')) || [];
saveBtn.forEach(function (saves) {
    saves.addEventListener('click', function (event) {
        let row = event.target.parentNode
        let myContent = row.querySelector('.description').value;
        let hour = row.querySelector('.hour').textContent;
        saveArr.push({
            myContent,
            hour
        })
        //console.log(myContent)
        //console.log(hour)
        localStorage.setItem('saveArr', JSON.stringify(saveArr));


    })
})





des.forEach(function (item){
 let timeCurrent = item.name
    //console.log(timeCurrent)
    for(let i = 0; i < saveArr.length; i++){
        let get = saveArr[i];
        //console.log(get.hour)
        //console.log(item.name)
        if(get.hour == timeCurrent ){

           item.value = get.myContent
           console.log(get.myContent)
        }
    }
})



