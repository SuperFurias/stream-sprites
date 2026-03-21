// Help tab - dynamically loads available commands

window.tabInitializers = window.tabInitializers || {};
window.tabInitializers.help = async function() {
  console.log('Help tab initialized');
  try {
    const response = await fetch('dashboard/commands.json');
    if (!response.ok) {
      throw new Error('Failed to load commands.json');
    }
    const commands = await response.json();
    const list = document.getElementById('commands-list');
    if (list) {
      // Clear any existing content
      list.innerHTML = '';
      // Add each command as a list item
      for (const [cmd, desc] of Object.entries(commands)) {
        const li = document.createElement('li');
        li.innerHTML = `<code>${cmd}</code> - ${desc}`;
        list.appendChild(li);
      }
    }
  } catch (error) {
    console.error('Error loading commands:', error);
    // Optionally display error message in the UI
    const list = document.getElementById('commands-list');
    if (list) {
      list.innerHTML = '<li>Failed to load commands. Please refresh the page.</li>';
    }
  }
};
