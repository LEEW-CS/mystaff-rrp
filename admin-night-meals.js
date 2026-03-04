// =====================================================
// NIGHT MEALS CRUD (Planet Yum — multi-currency)
// =====================================================
const MEAL_CURRENCIES = ['USD','AUD','GBP','HKD','SGD','EUR','CAD','NZD'];

let mealsCache = [];

function mealPriceCols(item) {
    return MEAL_CURRENCIES.map(c => {
        const v = item['price_' + c.toLowerCase()];
        const num = parseFloat(v) || 0;
        return `<td style="text-align:center;font-family:'Space Mono',monospace;font-size:0.8rem;">${num === 0 ? '<span style="color:#94a3b8;">0</span>' : num}</td>`;
    }).join('');
}

async function loadNightMeals() {
    try {
        const { data, error } = await supabaseClient
            .from('night_meals_config')
            .select('*')
            .order('id');

        if (error) throw error;

        mealsCache = data || [];
        const tbody = document.getElementById('mealsTableBody');

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;color:var(--text-muted);">No meal options configured.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(item => {
            const defaultBadge = item.is_default
                ? '<span style="background:#dcfce7;color:#166534;padding:0.2rem 0.6rem;border-radius:4px;font-size:0.75rem;font-weight:600;">✅ Default</span>'
                : `<button class="btn btn-secondary btn-sm" onclick="setDefaultMeal(${item.id})">Set Default</button>`;
            const skuDisplay = item.sku
                ? `<code style="font-size:0.7rem;background:#f1f5f9;padding:0.2rem 0.4rem;border-radius:4px;">${item.sku}</code>`
                : '<span style="color:#94a3b8;">—</span>';
            return `<tr>
                <td>${defaultBadge}</td>
                <td>${skuDisplay}</td>
                <td><strong>${item.name}</strong></td>
                ${mealPriceCols(item)}
                <td class="actions">
                    <button class="btn btn-secondary btn-sm" onclick="editMealOption(${item.id})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteMeal(${item.id})">Delete</button>
                </td>
            </tr>`;
        }).join('');

    } catch (error) {
        console.error('Error loading meals:', error);
        document.getElementById('mealsStatus').innerHTML = `<div class="status-message error">Error loading meal options: ${error.message}</div>`;
    }
}

function showAddMealModal() {
    document.getElementById('newMealSku').value     = '';
    document.getElementById('newMealName').value    = '';
    document.getElementById('newMealDefault').checked = false;
    MEAL_CURRENCIES.forEach(c => {
        document.getElementById('newMeal' + c).value = '';
    });
    document.getElementById('addMealModal').classList.add('active');
}

function mealPricePayload(prefix) {
    const obj = {};
    MEAL_CURRENCIES.forEach(c => {
        obj['price_' + c.toLowerCase()] = parseFloat(document.getElementById(prefix + c).value) || 0;
    });
    return obj;
}

async function addMealOption() {
    const name       = document.getElementById('newMealName').value.trim();
    const sku        = document.getElementById('newMealSku').value.trim();
    const is_default = document.getElementById('newMealDefault').checked;

    if (!name) { alert('Product name is required'); return; }

    try {
        if (is_default) {
            await supabaseClient.from('night_meals_config').update({ is_default: false }).neq('id', 0);
        }

        const { error } = await supabaseClient
            .from('night_meals_config')
            .insert([{ name, sku, is_default, ...mealPricePayload('newMeal') }]);

        if (error) throw error;

        hideModal('addMealModal');
        loadNightMeals();
        document.getElementById('mealsStatus').innerHTML = `<div class="status-message success">Meal option "${name}" added successfully!</div>`;
        setTimeout(() => document.getElementById('mealsStatus').innerHTML = '', 3000);

    } catch (error) {
        console.error('Error adding meal option:', error);
        alert('Error adding meal option: ' + error.message);
    }
}

function editMealOption(id) {
    const item = mealsCache.find(m => m.id === id);
    if (!item) { alert('Meal not found'); return; }

    document.getElementById('editMealId').value      = item.id;
    document.getElementById('editMealSku').value     = item.sku || '';
    document.getElementById('editMealName').value    = item.name;
    document.getElementById('editMealDefault').checked = item.is_default;
    MEAL_CURRENCIES.forEach(c => {
        document.getElementById('editMeal' + c).value = item['price_' + c.toLowerCase()] || '';
    });
    document.getElementById('editMealModal').classList.add('active');
}

async function saveMealOption() {
    const id         = document.getElementById('editMealId').value;
    const name       = document.getElementById('editMealName').value.trim();
    const sku        = document.getElementById('editMealSku').value.trim();
    const is_default = document.getElementById('editMealDefault').checked;

    if (!name) { alert('Product name is required'); return; }

    try {
        if (is_default) {
            await supabaseClient.from('night_meals_config').update({ is_default: false }).neq('id', id);
        }

        const { error } = await supabaseClient
            .from('night_meals_config')
            .update({ name, sku, is_default, ...mealPricePayload('editMeal') })
            .eq('id', id);

        if (error) throw error;

        hideModal('editMealModal');
        loadNightMeals();
        document.getElementById('mealsStatus').innerHTML = `<div class="status-message success">Meal option updated successfully!</div>`;
        setTimeout(() => document.getElementById('mealsStatus').innerHTML = '', 3000);

    } catch (error) {
        console.error('Error updating meal option:', error);
        alert('Error updating meal option: ' + error.message);
    }
}

async function setDefaultMeal(id) {
    try {
        await supabaseClient.from('night_meals_config').update({ is_default: false }).neq('id', 0);
        const { error } = await supabaseClient.from('night_meals_config').update({ is_default: true }).eq('id', id);
        if (error) throw error;
        loadNightMeals();
        document.getElementById('mealsStatus').innerHTML = `<div class="status-message success">Default meal option updated!</div>`;
        setTimeout(() => document.getElementById('mealsStatus').innerHTML = '', 3000);
    } catch (error) {
        console.error('Error setting default meal:', error);
        alert('Error setting default meal: ' + error.message);
    }
}

async function deleteMeal(id) {
    if (!confirm('Are you sure you want to delete this meal option?')) return;
    try {
        const { error } = await supabaseClient.from('night_meals_config').delete().eq('id', id);
        if (error) throw error;
        loadNightMeals();
        document.getElementById('mealsStatus').innerHTML = `<div class="status-message success">Meal option deleted successfully!</div>`;
        setTimeout(() => document.getElementById('mealsStatus').innerHTML = '', 3000);
    } catch (error) {
        console.error('Error deleting meal option:', error);
        alert('Error deleting meal option: ' + error.message);
    }
}
