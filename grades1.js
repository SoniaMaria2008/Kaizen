grades.js — cod nou adăugat (după funcția predict, înainte de populateSubjectSelect)
/*  predictor recuriv— backtracking
 gaseste toate combinatiile de note intregi (1-10) care duc la media dorita */

export function predictAll(currentGrades, target, remaining) {
  if (!Array.isArray(currentGrades)) {
    return { feasible: false, reason: 'Date invalide.' };
  }
  if (isNaN(target) || target < 1 || target > 10) {
    return { feasible: false, reason: 'Media tinta trebuie sa fie intre 1 si 10.' };
  }
  if (!Number.isInteger(remaining) || remaining < 1 || remaining > 6) {
    return { feasible: false, reason: 'Numarul de note viitoare trebuie sa fie intre 1 si 6 (limita algoritmului recursiv).' };
  }

  const n           = currentGrades.length;
  const currentSum  = currentGrades.reduce((a, b) => a + b, 0);
  const totalCount  = n + remaining;

  //   target * totalCount = currentSum + sumViitoare
  //   => sumViitoare = target * totalCount - currentSum
  const neededSumFloat = target * totalCount - currentSum;

  // notele viitoare sunt intregi => suma lor trebuie sa fie un intreg.
  // rotunjim la cel mai apropiat intreg 
  const neededSum = Math.round(neededSumFloat);

  const achievableAvg = (currentSum + neededSum) / totalCount;
  if (Math.abs(achievableAvg - target) > 0.005) {
    return {
      feasible: false,
      reason: `Media ${target} nu poate fi atinsa exact cu note intregi (1–10). Cea mai apropiata medie posibila ar fi ${achievableAvg.toFixed(2)}.`,
    };
  }

  if (neededSum < remaining) {
    return {
      feasible: true,
      easy: true,
      message: 'Media tinta este deja garantata, indiferent de notele viitoare!',
      currentAvg: n > 0 ? Math.round((currentSum / n) * 100) / 100 : null,
    };
  }

  if (neededSum > remaining * 10) {
    return {
      feasible: false,
      reason: 'Imposibil: chiar si cu 10 la toate notele viitoare, nu poti atinge aceasta medie.',
    };
  }

  // backtracking
  // Gasim toate combinatiile de `remaining` note intregi din [1, 10] a caror suma este exact `neededSum`.

  const allCombinations = [];

  function backtrack(sumLeft, gradesLeft, current, minGrade) {
    if (gradesLeft === 0) {
      if (sumLeft === 0) {
        allCombinations.push([...current]); 
      }
      return;
    }

    // pruning)
    //   lim inferioara: chiar cu toti 1, suma e gradesLeft  → insuficient
    //   lim superioara: chiar cu toti 10, suma e gradesLeft*10 → prea mult
    if (sumLeft < gradesLeft || sumLeft > gradesLeft * 10) return;

    //  incercam fiecare nota intreaga de la minGrade la 10
    for (let grade = minGrade; grade <= 10; grade++) {
      current.push(grade);                                         
      backtrack(sumLeft - grade, gradesLeft - 1, current, grade);  // 
      current.pop();                                               
    }
  }

  backtrack(neededSum, remaining, [], 1);

  if (allCombinations.length === 0) {
    return {
      feasible: false,
      reason: 'Nu exista nicio combinatie de note intregi (1–10) care sa duca la aceasta medie exacta.',
    };
  }

  // grupare
  const groups = { minim: [], mediu: [], maxim: [] };

  for (const combo of allCombinations) {
    const minGrade = combo[0]; 
    if (minGrade >= 9)      groups.maxim.push(combo);
    else if (minGrade >= 7) groups.mediu.push(combo);
    else                    groups.minim.push(combo);
  }

  return {
    feasible:      true,
    totalCount:    allCombinations.length,
    groups,
    neededSum,
    remaining,
    targetAverage: target,
  };
}
