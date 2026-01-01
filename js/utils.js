export const sanitize = (input) => {
    const temp = document.createElement('div');
    temp.textContent = input;
    return temp.innerHTML;
};

export const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};
